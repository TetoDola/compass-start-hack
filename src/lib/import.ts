import type { Row, Dataset, FundBreakdown } from './types';
import { list, redact } from './format';

/** Restore metadata omitted by older projections without replacing imported identities or supplied values. */
export function restoreReferenceClassifications(saved: Dataset, original: Dataset): Dataset {
  const classificationFields = ['CountryName', 'IndustryName', 'CountryGroupName', 'SAA_CountryGroupName', 'SAA_IndustryName'] as const;
  let changed = false;
  const Securities = saved.reference.Securities.map(security => {
    if (!security.Isin || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(security.Isin)) return security;
    const matches = original.reference.Securities.filter(source => source.Isin === security.Isin && (security.ExternalSource ? source.SecurityTypeName === security.SecurityTypeName : source.Id === security.Id));
    const restored = { ...security };
    for (const field of classificationFields) {
      if (security[field] != null) continue;
      const values = [...new Set(matches.map(s => s[field]).filter((v): v is string => typeof v === 'string' && !!v.trim()))];
      if (values.length === 1) { restored[field] = values[0]; changed = true; }
    }
    return restored;
  });
  return changed ? { ...saved, reference: { ...saved.reference, Securities } } : saved;
}

const numericKeys = new Set(['ClientId','PortfolioId','ProposalId','SecurityId','Id','TransactionCount','AssetsUnderManagementInDefaultCurrency','LiquidityInDefaultCurrency','Quantity','PricePerUnit','TotalAmountInPortfolioCurrency','PortfolioValuePercentage','Volatility','ExpectedReturn','ValueAtRisk','Value','TargetPercentage','MinPercentage','MaxPercentage','MaxVola','MaxPRC','EquityQuoteInPercent','RiskLevel','PRC','SustainabilityScore','MinimumPositionLevel']);
function check(value: unknown, path: string) {
  if (Array.isArray(value)) { value.forEach((v, i) => check(v, `${path}[${i}]`)); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, v] of Object.entries(value)) {
    if (numericKeys.has(key) && v != null && (typeof v !== 'number' || !Number.isFinite(v))) throw new Error(`${path}.${key} must be a number or null.`);
    check(v, `${path}.${key}`);
  }
}
const pick = (row: Row, keys: string[]): Row => Object.fromEntries(keys.filter(k => row[k] != null).map(k => {
  const value = k === 'ViolationPath' && Array.isArray(row[k]) ? JSON.stringify(row[k].map((r: Row) => pick(r, ['FieldName', 'LeftValue', 'RightValue', 'Operator']))) : row[k];
  if (['LeftValue','RightValue'].includes(k) && Array.isArray(value) && value.every(v => v == null || ['string','number','boolean'].includes(typeof v))) return [k, redact(JSON.stringify(value))];
  if (typeof value === 'object') throw new Error(`${k} must be a simple value.`);
  return [k, typeof value === 'string' ? redact(value) : value];
}));
function records(row: Row, key: string) {
  if (row[key] != null && !Array.isArray(row[key])) throw new Error(`${key} must be an array or null.`);
  const result = list(row[key]);
  if (result.some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw new Error(`${key} must contain objects.`);
  return result;
}

/** A clients array reuses the current reference universe. An envelope supplies its own reference data. */
export function parseDatasetUpload(text: string, reference: Dataset['reference']): { clients: Row[]; reference: Dataset['reference']; suppliedReference: boolean } {
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (Array.isArray(data)) return { clients: projectClients(data), reference, suppliedReference: false };
  if (!data || !Array.isArray(data.clients) || !data.reference || typeof data.reference !== 'object') throw new Error('Expected a clients array or { clients, reference } with a Securities list.');
  return { clients: projectClients(data.clients), suppliedReference: true, reference: projectReference(data.reference, reference) };
}

function mergeReference(current: Dataset['reference'], incoming: Dataset['reference']): Dataset['reference'] {
  const sameValue = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => sameValue(value, b[index]));
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return false;
    const left = a as Row, right = b as Row;
    return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => key in right && sameValue(left[key], right[key]));
  };
  const merge = <T extends Row>(collection: string, original: T[] = [], added: T[] = [], key: 'Id' | 'id' = 'Id'): T[] => {
    const rows = [...original], byId = new Map(rows.map((row, index) => [row[key], index]));
    for (const row of added) {
      const index = byId.get(row[key]);
      if (index == null) { byId.set(row[key], rows.length); rows.push(row); continue; }
      const previous = rows[index];
      for (const [field, value] of Object.entries(row)) {
        if (previous[field] != null && value != null && !sameValue(previous[field], value)) throw new Error(`${collection} ID ${row[key]} conflicts with the current reference data.`);
      }
      rows[index] = { ...previous, ...row };
    }
    return rows;
  };
  return {
    ...current,
    Securities: merge('Security', current.Securities, incoming.Securities),
    RiskProfiles: merge('Risk profile', current.RiskProfiles, incoming.RiskProfiles),
    EsgProfiles: merge('ESG profile', current.EsgProfiles, incoming.EsgProfiles),
    StrategicAssetAllocations: merge('Strategic allocation', current.StrategicAssetAllocations, incoming.StrategicAssetAllocations),
    FundBreakdowns: merge('Fund breakdown', current.FundBreakdowns, incoming.FundBreakdowns, 'id'),
  };
}

function comparableClient(client: Row): string {
  return JSON.stringify({ ...client, SuitabilityViolations: list(client.SuitabilityViolations).map(v => {
    if (typeof v.ViolationPath !== 'string') return v;
    try {
      const path = JSON.parse(v.ViolationPath);
      if (!Array.isArray(path)) return v;
      return { ...v, ViolationPath: JSON.stringify(path.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, ['LeftValue', 'RightValue'].includes(key) && Array.isArray(value) ? JSON.stringify(value) : value]))) ) };
    } catch { return v; }
  }) });
}

/** Validate a whole selection before the caller saves it, so a bad file cannot leave a partial import. */
export function mergeJsonUploads(current: Dataset, files: { name: string; text: string }[]): { dataset: Dataset; added: number; skipped: number; referenceAdded: boolean; firstClientId: number | null } {
  if (!files.length) throw new Error('Choose at least one JSON file.');
  const clients = [...current.clients], byId = new Map(clients.map((client, index) => [client.ClientId, index]));
  const byRef = new Map(clients.map(client => [client.ClientRef, client.ClientId]));
  let reference = current.reference, added = 0, skipped = 0, referenceAdded = false, hasClients = false, firstClientId: number | null = null;
  for (const file of files) {
    let data: any;
    try { data = JSON.parse(file.text); } catch { throw new Error(`${file.name}: invalid JSON.`); }
    try {
      if (data && typeof data === 'object' && !Array.isArray(data) && !('clients' in data) && Array.isArray(data.Securities)) {
        reference = mergeReference(reference, projectReference(data, reference));
        referenceAdded = true;
        continue;
      }
      const parsed = Array.isArray(data)
        ? { clients: projectClients(data), reference, suppliedReference: false }
        : data && Array.isArray(data.clients) && data.reference && typeof data.reference === 'object'
          ? { clients: projectClients(data.clients), reference: projectReference(data.reference, reference), suppliedReference: true }
          : null;
      if (!parsed) throw new Error('Expected a clients array, { clients, reference }, or a reference object with Securities.');
      hasClients = true;
      if (parsed.suppliedReference) { reference = mergeReference(reference, parsed.reference); referenceAdded = true; }
      for (const client of parsed.clients) {
        const id = client.ClientId, ref = client.ClientRef;
        const index = byId.get(id);
        if (index != null) {
          const previous = projectClients([clients[index]])[0];
          if (previous.ClientRef !== ref || comparableClient(previous) !== comparableClient(client)) throw new Error(`ClientId ${id} already belongs to a different or changed client.`);
          skipped++; continue;
        }
        if (byRef.has(ref)) throw new Error(`ClientRef ${ref} already belongs to ClientId ${byRef.get(ref)}.`);
        if (firstClientId == null) firstClientId = id;
        byId.set(id, clients.length); byRef.set(ref, id); clients.push(client); added++;
      }
    } catch (error) { throw new Error(`${file.name}: ${error instanceof Error ? error.message : 'Invalid data.'}`); }
  }
  if (!hasClients) throw new Error('Choose at least one JSON file containing clients.');
  return { dataset: { ...current, version: 'Imported · client workspace', clients, reference }, added, skipped, referenceAdded, firstClientId };
}

function projectReference(raw: Row, reference: Dataset['reference']): Dataset['reference'] {
  if (!Array.isArray(raw.Securities)) throw new Error('The supplied reference needs a Securities array.');
  check(raw, 'reference');
  const ids = new Set<number>();
  const securities = records(raw, 'Securities').map(s => {
    if (!Number.isSafeInteger(s.Id) || ids.has(s.Id)) throw new Error('Securities need unique numeric Id values.'); ids.add(s.Id);
    return pick(s, ['Id','Isin','Name','SecurityTypeName','Currency','PriceDateUtc','EndOfDayPrice','MaturityDateUtc','SAA_AssetClassName','IndustryName','CountryName','CountryGroupName','SAA_CountryGroupName','SAA_IndustryName','InRecommendationList','PRC','SustainabilityScore']);
  });
  const funds = new Map<number, FundBreakdown>();
  for (const row of records(raw, 'FundUnbundlingMappings')) {
    if (!Number.isSafeInteger(row.FundSecurityId) || typeof row.Weight !== 'number' || !Number.isFinite(row.Weight)) throw new Error('Invalid fund category mapping.');
    const fund = funds.get(row.FundSecurityId) || { id: row.FundSecurityId, total: 0, sectors: Object.create(null), regions: Object.create(null) };
    fund.total += row.Weight;
    for (const [field, dim] of [['IndustryName', 'sectors'], ['CountryGroupName', 'regions']] as const) { const label = typeof row[field] === 'string' ? row[field] : 'Not classified'; fund[dim][label] = (fund[dim][label] || 0) + row.Weight; }
    funds.set(row.FundSecurityId, fund);
  }
  if (!funds.size) for (const row of records(raw, 'FundBreakdowns')) {
    if (!Number.isSafeInteger(row.id) || !Number.isFinite(row.total) || row.total < 0) throw new Error('Invalid prepared fund breakdown.');
    const breakdown: FundBreakdown = { id: row.id, total: row.total, sectors: Object.create(null), regions: Object.create(null) };
    for (const dim of ['sectors', 'regions'] as const) {
      if (!row[dim] || typeof row[dim] !== 'object' || Array.isArray(row[dim])) throw new Error('Invalid fund category dimension.');
      for (const [label, weight] of Object.entries(row[dim])) { if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) throw new Error('Invalid fund category weight.'); breakdown[dim][label] = weight; }
      if (Math.abs(Object.values(breakdown[dim]).reduce((n, w) => n+w, 0) - row.total) > Math.max(.00001, row.total * .001)) throw new Error('Fund categories do not reconcile to their total.');
    }
    funds.set(row.id, breakdown);
  }
  return {
    Securities: securities, FundBreakdowns: [...funds.values()],
    RiskProfiles: records(raw, 'RiskProfiles').map(r => pick(r, ['Id', 'Name', 'RiskLevel', 'MaxVola', 'MaxPRC', 'EquityQuoteInPercent'])),
    EsgProfiles: records(raw, 'EsgProfiles').map(r => pick(r, ['Id', 'Name', 'MinimumPositionLevel'])),
    StrategicAssetAllocations: records(raw, 'StrategicAssetAllocations').map(r => ({ ...pick(r, ['Id', 'Name']), Mappings: records(r, 'Mappings').map(m => pick(m, ['Dimension', 'Category', 'TargetPercentage', 'MinPercentage', 'MaxPercentage'])) })),
    // Constituent snapshots are obtained through the verified server resolver, independently of security IDs.
    FundHoldings: reference.FundHoldings,
  };
}
export function parseCustomerUpload(text: string): Row[] {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON. Choose a clients.json file.'); }
  return projectClients(data);
}
function projectClients(data: unknown): Row[] {
  if (!Array.isArray(data) || !data.length) throw new Error('Expected a non-empty array of customers, like clients.json.');
  check(data, 'customers');
  const ids = new Set();
  return data.map((c, index) => {
    if (!c || typeof c !== 'object' || !Number.isSafeInteger(c.ClientId) || typeof c.ClientRef !== 'string' || !c.ClientRef.trim()) throw new Error(`Customer ${index + 1} needs a numeric ClientId and a ClientRef.`);
    if (ids.has(c.ClientId)) throw new Error(`Duplicate ClientId ${c.ClientId} in this file.`);
    ids.add(c.ClientId);
    for (const field of ['FirstName','LastName','Company']) {
      if (c[field] != null && (typeof c[field] !== 'string' || c[field].length > 300)) throw new Error(`${field} must be text up to 300 characters.`);
    }
    const portfolioIds = new Set();
    return {
      ...pick(c, ['ClientId','ClientRef','FirstName','LastName','Company','IsClientACompany','RegulatoryClientTypeName','ReportingCurrency','RiskProfileId','RiskProfileName','EsgProfileId','EsgProfileName','ProfilingDateUtc','AssetsUnderManagementInDefaultCurrency','LiquidityInDefaultCurrency']),
      ClientNotes: records(c, 'ClientNotes').map(n => pick(n, ['Note','CreatedByDateUTC'])),
      Tags: records(c, 'Tags').map(t => pick(t, ['TagName','TagTypeName'])),
      Portfolios: records(c, 'Portfolios').map(p => {
        if (!Number.isSafeInteger(p.PortfolioId) || portfolioIds.has(p.PortfolioId)) throw new Error(`${c.ClientRef} needs unique numeric PortfolioId values.`);
        portfolioIds.add(p.PortfolioId);
        return {
          ...pick(p, ['PortfolioId','PortfolioNr','Name','IsConsolidated','PortfolioCurrency','StrategicAssetAllocationId','InvestmentServiceName','StrategyName','ReferenceCurrency','AssetsUnderManagementInDefaultCurrency','LiquidityInDefaultCurrency','Volatility','ExpectedReturn','ValueAtRisk','FactoryDateUtc']),
          SecurityPositions: records(p, 'SecurityPositions').map(s => pick(s, ['SecurityId','SecurityName','Isin','SecurityIsin','SecurityTypeName','PriceDateUtc','Currency','Quantity','PricePerUnit','TotalAmountInPortfolioCurrency','PortfolioValuePercentage'])),
          AccountPositions: records(p, 'AccountPositions').map(a => pick(a, ['Currency','TotalAmountInPortfolioCurrency','PortfolioValuePercentage'])),
          PerformanceHistory: records(p, 'PerformanceHistory').map(h => pick(h, ['Date','Value'])),
        };
      }),
      Proposals: records(c, 'Proposals').map(p => pick(p, ['ProposalId','PortfolioId','ProposalStatusName','Currency','ProposedDateUTC','FinalizedDateUTC','Reason'])),
      SuitabilityViolations: records(c, 'SuitabilityViolations').map(v => pick(v, ['Id','PortfolioId','RuleCode','RuleDescription','ViolationPath','Severity','LastViolatedDateUTC'])),
      TransactionCount: c.TransactionCount ?? records(c, 'Transactions').length,
    };
  });
}
