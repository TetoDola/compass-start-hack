import type { ProviderConfig } from './providers';
import type { WorldArticle, WorldLayerStatus, WorldQuote } from '../src/lib/world';

const DAY = 86400000;
const FIRMS = 'https://firms.modaps.eosdis.nasa.gov';
const EIA = 'https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm';
const AIS = 'https://aisstream.io/';
const number = (value: unknown): number => typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
const coordinates = (lon: number, lat: number) => Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90;

export function parseFirms(csv: string, now = Date.now()): WorldArticle[] {
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  const columns = header.split(',');
  if (!['latitude', 'longitude', 'acq_date', 'acq_time', 'confidence', 'frp'].every(c => columns.includes(c))) throw new Error('Invalid FIRMS response');
  const rows: WorldArticle[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const cells = line.split(',');
    if (cells.length !== columns.length) continue;
    const row = Object.fromEntries(columns.map((c, i) => [c, cells[i]]));
    const lat = number(row.latitude), lon = number(row.longitude), frp = number(row.frp);
    const time = row.acq_time.padStart(4, '0');
    if (!coordinates(lon, lat) || !/^\d{4}-\d{2}-\d{2}$/.test(row.acq_date) || !/^([01]\d|2[0-3])[0-5]\d$/.test(time) || !['n', 'h'].includes(row.confidence)) continue;
    const publishedAt = `${row.acq_date}T${time.slice(0, 2)}:${time.slice(2)}:00.000Z`;
    const stamp = Date.parse(publishedAt);
    if (!Number.isFinite(stamp) || new Date(stamp).toISOString() !== publishedAt || stamp > now || stamp < now - 2 * DAY) continue;
    const id = `firms:${lat}:${lon}:${publishedAt}`;
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, title: `Satellite thermal detection · ${lat.toFixed(2)}, ${lon.toFixed(2)}`, source: 'NASA FIRMS · VIIRS NOAA-20', url: `${FIRMS}/map/#d:24hrs;@${lon},${lat},12z`, publishedAt, tickers: [], portfolioMatch: 'none' as const, location: [lon, lat], locationName: 'Satellite detection coordinates', layer: 'disaster', summary: `${row.confidence === 'h' ? 'High' : 'Nominal'} confidence thermal anomaly${Number.isFinite(frp) && frp >= 0 ? `; fire radiative power ${frp} MW` : ''}. Satellite acquisition time in UTC. A detection may be a fire or another heat source; it does not establish damage or company exposure.` });
  }
  return rows.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function parseEia(raw: any, now = Date.now()): WorldQuote[] {
  const data = Array.isArray(raw?.response?.data) ? raw.response.data : [];
  return ([['RWTC', 'WTI spot'], ['RBRTE', 'Brent spot']] as const).flatMap(([series, name]) => {
    const rows = data.filter((r: any) => r.series === series && /^\d{4}-\d{2}-\d{2}$/.test(r.period) && Number.isFinite(Date.parse(r.period)) && new Date(r.period).toISOString().slice(0, 10) === r.period && Date.parse(r.period) <= now && Number.isFinite(number(r.value)) && /^(?:\$\/BBL|(?:dollars|\$) per barrel)$/i.test(r.units)).sort((a: any, b: any) => b.period.localeCompare(a.period));
    const unique = rows.filter((r: any, i: number) => rows.findIndex((v: any) => v.period === r.period) === i);
    if (!unique.length) return [];
    const price = number(unique[0].value), previous = number(unique[1]?.value);
    return [{ symbol: `EIA:${series}`, name, price, change: Number.isFinite(previous) && previous !== 0 ? (price - previous) / Math.abs(previous) * 100 : null, asOf: `${unique[0].period}T00:00:00.000Z`, currency: 'USD', unit: 'USD/barrel', changeBasis: 'previous observation', source: 'U.S. EIA · daily spot price', url: EIA, sparkline: unique.slice(0, 30).reverse().map((r: any) => number(r.value)) }];
  });
}

export function parseAis(raw: any, now = Date.now()): WorldArticle[] {
  if (raw?.dataAvailable !== true) return [];
  const reports = Array.isArray(raw.snapshot?.tankerReports) ? raw.snapshot.tankerReports : [];
  const seen = new Set<string>();
  return [...reports].sort((a, b) => number(b.timestamp) - number(a.timestamp)).flatMap((r: any) => {
    const lon = number(r.lon), lat = number(r.lat), timestamp = number(r.timestamp), mmsi = String(r.mmsi);
    if (!/^\d{9}$/.test(mmsi) || !coordinates(lon, lat) || !Number.isFinite(timestamp) || timestamp > now || timestamp < now - 30 * 60000 || seen.has(mmsi)) return [];
    seen.add(mmsi);
    return [{ id: `ais:${mmsi}`, title: `Tanker position · ${String(r.name || mmsi).slice(0, 100)}`, source: 'AISstream via World Monitor', url: `${AIS}#mmsi-${mmsi}`, publishedAt: new Date(timestamp).toISOString(), tickers: [], portfolioMatch: 'none' as const, location: [lon, lat] as [number, number], locationName: 'Reported AIS position', layer: 'shipping' as const, summary: `MMSI ${mmsi}. Last position received by the relay at ${new Date(timestamp).toISOString()}. Limited tanker sample, not a complete vessel census. Reception time is not a verified satellite observation time. No cargo, disruption, ownership or portfolio dependency is inferred.` }];
  }).slice(0, 100);
}

export async function loadKeyedWorldProviders(config: ProviderConfig, request: typeof fetch = fetch) {
  const signals: WorldArticle[] = [], quotes: WorldQuote[] = [], layers: WorldLayerStatus[] = [];
  const now = Date.now();
  async function get(url: string | URL, local = false) {
    const response = await request(url, { headers: { 'User-Agent': 'Compass/1.0', ...(local && config.WORLDMONITOR_API_KEY ? { 'X-WorldMonitor-Key': config.WORLDMONITOR_API_KEY } : {}) }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Provider unavailable');
    return response;
  }
  async function source(id: string, label: string, sourceUrl: string, configured: boolean, read: () => Promise<Omit<WorldLayerStatus, 'id' | 'label' | 'sourceUrl'>>) {
    const base = { id, label, sourceUrl };
    if (!configured) { layers.push({ ...base, state: 'unavailable', count: 0, message: 'Provider is not configured.' }); return; }
    try { layers.push({ ...base, ...await read() }); }
    catch { layers.push({ ...base, state: 'unavailable', count: 0, message: 'Provider request failed or returned invalid data. Check the server configuration and provider availability.' }); }
  }
  await Promise.all([
    source('firms', 'NASA FIRMS thermal detections', `${FIRMS}/map/`, !!config.NASA_FIRMS_API_KEY, async () => {
      const rows = parseFirms(await (await get(`${FIRMS}/api/area/csv/${encodeURIComponent(config.NASA_FIRMS_API_KEY!)}/VIIRS_NOAA20_NRT/world/2`)).text(), now);
      signals.push(...rows.slice(0, 300));
      return { state: rows.length > 300 ? 'partial' : 'available', count: Math.min(rows.length, 300), message: `Showing ${Math.min(rows.length, 300)} of ${rows.length} nominal/high-confidence detections returned for today and yesterday (UTC), newest first. NOAA-20 only; thermal detections are not confirmed wildfires.` };
    }),
    source('eia', 'EIA energy spot prices', EIA, !!config.EIA_API_KEY, async () => {
      const url = new URL('https://api.eia.gov/v2/petroleum/pri/spt/data/');
      url.search = new URLSearchParams({ api_key: config.EIA_API_KEY!, frequency: 'daily', 'data[]': 'value', 'sort[0][column]': 'period', 'sort[0][direction]': 'desc', length: '64' }).toString();
      for (const series of ['RWTC', 'RBRTE']) url.searchParams.append('facets[series][]', series);
      const rows = parseEia(await (await get(url)).json(), now);
      quotes.push(...rows);
      const stale = rows.some(r => now - Date.parse(r.asOf!) > 14 * DAY);
      return { state: !rows.length ? 'unavailable' : stale ? 'stale' : rows.length === 2 ? 'available' : 'partial', count: rows.length, message: `${rows.length} daily spot-price series. USD per barrel; change versus previous published observation. Publication can lag the observation date.${stale ? ' One or more observations are over 14 days old.' : ''}` };
    }),
    source('ais', 'AISstream tanker positions', AIS, !!config.WORLDMONITOR_BASE_URL && !!config.AISSTREAM_API_KEY, async () => {
      const url = new URL('/api/maritime/v1/get-vessel-snapshot?include_tankers=true', config.WORLDMONITOR_BASE_URL);
      const raw = await (await get(url, true)).json();
      const rows = parseAis(raw, now);
      signals.push(...rows);
      const connected = raw?.snapshot?.status?.connected === true;
      const vessels = number(raw?.snapshot?.status?.vessels);
      return { state: rows.length || connected ? 'partial' : 'unavailable', count: rows.length, message: `${connected ? `Relay connected${Number.isFinite(vessels) ? `; ${vessels} vessels tracked` : ''}.` : 'Relay disconnected or unavailable.'} ${rows.length} sampled tanker positions received within 30 minutes.${connected && !rows.length ? ' Tanker classification needs vessel type broadcasts and can take several minutes after startup.' : ''} Global vessel coverage is incomplete; positions do not establish disruption or portfolio exposure.` };
    }),
  ]);
  return { signals, quotes, layers };
}
