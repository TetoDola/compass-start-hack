import { fundDenominator } from './types';
import { aggregateProducts, productEvidence, lookThrough } from './advisory';
import type { Analysis, Evidence, FundHoldingSnapshot } from './types';
import { contextEvidence, instrumentId, type MarketContext } from './briefing';
import { portfolioExposures } from './portfolio';
import { materialEvent } from './events';
import { dateLabel, money, percent } from './format';

export interface NetworkNode { id: string; name: string; type: string; evidence: Evidence[]; description: string; isin?: string; snapshot?: FundHoldingSnapshot; expanded?: boolean; materialEvent?: boolean }
export interface NetworkEdge { id: string; source: string; target: string; labels: string[]; inferred?: boolean; evidence: Evidence[]; detail: string }
export interface FinancialNetwork { nodes: NetworkNode[]; edges: NetworkEdge[] }
export function buildNetwork(a: Analysis, expanded: Set<string>, context?: MarketContext | null): FinancialNetwork {
  const nodes = new Map<string, NetworkNode>(); const edges: NetworkEdge[] = [];
  const put = (node: NetworkNode) => { const old = nodes.get(node.id); if (!old) nodes.set(node.id, node); else old.evidence = [...new Map([...old.evidence, ...node.evidence].map(e => [e.id, e])).values()]; };
  const edge = (source: string, target: string, label: string, evidence: Evidence[] = [], detail = label, inferred = false) => edges.push({ id: `${source}>${target}:${edges.length}`, source, target, labels: [label], evidence, detail, inferred });
  put({ id: 'customer', name: a.customer.ClientRef, type: 'client', evidence: [], description: a.strategy });
  for (const p of a.portfolios) {
    const evidence = a.evidence.filter(e => e.id === `p-${p.PortfolioId}`);
    put({ id: `p-${p.PortfolioId}`, name: p.PortfolioNr || String(p.PortfolioId), type: 'portfolio', evidence, description: `${p.Name || p.StrategyName || 'Portfolio'} · ${money(p.AssetsUnderManagementInDefaultCurrency, a.currency)}` });
    edge('customer', `p-${p.PortfolioId}`, 'owns portfolio', evidence);
  }
  for (const h of a.holdings) {
    const id = instrumentId(h.isin, h.id), fund = h.instrumentType === 'Investment fund';
    put({ id, name: h.displayName, type: fund ? 'fund' : ['Shares', 'Dividend right certificates', 'Participation certificate'].includes(h.instrumentType) ? 'company' : 'instrument', evidence: [h.evidence], description: `${h.instrumentType} · ${h.isin || 'No verified ISIN'}. ${fund ? (lookThrough(h).status==='not-applicable'?'Inspect the product’s asset-specific risks.':'Expand to inspect dated top-ten constituents when available.') : 'Direct holding; inspect each position source for value and portfolio scope.'}`, isin: h.isin, snapshot: h.fundHoldings, expanded: expanded.has(id) });
    edge(`p-${h.portfolioId}`, id, 'holds directly', [h.evidence], `${h.portfolio}: ${money(h.value, h.currency)}${a.weightsAvailable ? ` · ${percent(h.weight)} of selected scope` : ' · combined scope weight unavailable'}. Position ${h.id}.`);
    if (!fund && h.sector !== 'Not classified') {
      const sectorId = `sector:${h.sector}`;
      put({ id: sectorId, name: h.sector, type: 'sector', evidence: [h.evidence], description: 'Supplied instrument classification. Sector membership is not financial correlation.' });
      edge(id, sectorId, 'classified in', [h.evidence]);
    }
    if (h.fundBreakdown) for (const [sector, weight] of Object.entries(h.fundBreakdown.sectors).filter(([, w]) => w > 0)) {
      const sid = `sector:${sector}`;
      const source: Evidence = { id: `sector-source:${h.id}:${sector}`, title: `${h.displayName} · ${sector}`, type: 'calculation', location: 'reference.json / FundUnbundlingMappings', fields: [{ label: 'Known share of fund', value: percent(weight / fundDenominator(h.fundBreakdown.total)) }], note: 'Supplied category percentages; only totals within 1 percentage point of 100 are normalized for rounding. Uncovered allocation remains unknown. It does not identify underlying companies.' };
      put({ id: sid, name: sector, type: 'sector', evidence: [source], description: 'Sector exposure from supplied classifications and fund category mappings.' });
      edge(id, sid, 'has sector exposure', [source]);
    }
    if (fund && expanded.has(id) && h.fundHoldings) {
      const snap = h.fundHoldings;
      snap.holdings.slice(0, 10).forEach((company, i) => {
        const cid = instrumentId(company.isin, `underlying:${h.isin || h.id}:${i}`);
        const source: Evidence = { id: `constituent:${h.id}:${i}`, title: `${company.name} through ${h.displayName}`, type: 'record', date: snap.asOf, location: snap.sourceUrl, fields: [{ label: 'Source', value: snap.sourceName }, { label: 'Published fund weight', value: percent(company.weight, 2) }, { label: 'Approximate scope exposure', value: a.weightsAvailable ? percent(h.weight * company.weight, 2) : 'Unavailable for this scope' }, { label: 'Holding ISIN', value: company.isin || 'Not supplied; name not merged with other securities' }], note: 'Top-ten coverage only. Fund and client position dates may differ. Indirect exposure is an estimate, not direct ownership.' };
        put({ id: cid, name: company.name, type: ['partial','complete'].includes(lookThrough(h).status)?'company':'instrument', evidence: [source], description: 'Underlying security from a dated fund snapshot. Identical verified ISINs share a node; names alone are never merged.', isin: company.isin });
        edge(id, cid, `${percent(company.weight, 2)} in fund`, [source], `Indirect holding · ${snap.sourceName} · ${dateLabel(snap.asOf, true)}. ${a.weightsAvailable ? `Approx. ${percent(h.weight * company.weight, 2)} of selected scope via this position.` : 'Combined scope exposure unavailable.'}`);
      });
    }
  }
  for (const kind of ['country', 'region'] as const) for (const exposure of portfolioExposures(a, kind)) {
    put({ id: exposure.id, name: exposure.name, type: kind, evidence: exposure.evidence, description: `${percent(exposure.weight)} of selected scope attributed to this ${kind}. ${kind === 'country' ? 'Known country classifications only; fund domicile is not underlying exposure.' : 'Supplied fund geography; this may span multiple countries.'}` });
    for (const source of exposure.evidence) {
      const h = a.holdings.find(h => source.id === h.id || source.id.startsWith(`category:${h.id}:`));
      if (h) edge(instrumentId(h.isin, h.id), exposure.id, `has ${kind} exposure`, [source]);
    }
  }
  for (const [i, v] of a.violations.entries()) {
    const vid = `issue-${v.Id ?? i}`;
    const source: Evidence = a.evidence.find(e => e.id === vid) || { id: vid, title: v.RuleCode || 'Recorded review point', type: 'record', date: v.LastViolatedDateUTC, location: `clients.json / ${a.customer.ClientRef} / SuitabilityViolations[Id=${v.Id}]`, fields: [{ label: 'Description', value: v.RuleDescription || 'Not supplied' }, { label: 'Path', value: v.ViolationPath || 'Not supplied' }, { label: 'Severity', value: v.Severity || 'Not supplied' }], note: 'Supplied rule-engine result; not newly calculated.' };
    put({ id: vid, name: v.RuleCode || 'Recorded issue', type: 'issue', evidence: [source], description: v.RuleDescription || 'Recorded rule-engine finding; inspect the original source.' });
    edge(`p-${v.PortfolioId}`, vid, 'recorded finding', [source]);
  }
  // Preserve calculation/proposal nodes used by the brief's evidence path.
  const alias = (id: string) => { const h = a.holdings.find(h => h.id === id); return h ? instrumentId(h.isin, id) : id === 'sector' ? `sector:${a.fundSectors[0]?.label}` : id; };
  for (const finding of a.findings) {
    for (const entity of finding.entities) {
      if (entity.type === 'note') continue;
      const id = alias(entity.id);
      if (nodes.has(id)) continue;
      put({ id, name: entity.label, type: entity.type === 'exposure' ? 'sector' : entity.type === 'holding' ? 'instrument' : entity.type, evidence: a.evidence.filter(e => e.id === entity.evidenceId), description: entity.value || finding.body });
    }
    for (const connection of finding.connections) {
      const from = alias(connection.from), to = alias(connection.to);
      if (nodes.has(from) && nodes.has(to) && !edges.some(e => e.source === from && e.target === to)) edge(from, to, connection.label, finding.evidence);
    }
  }
  for (const item of context?.items || []) {
    const linked = item.entityIds.filter(id => nodes.has(id));
    if (!linked.length) continue;
    put({ id: item.id, name: item.title, type: item.kind, evidence: [contextEvidence(item)], materialEvent: !!materialEvent(item.title), description: `${item.source} · ${dateLabel(item.publishedAt, true)}. ${item.relevance}` });
    for (const id of linked) { if (materialEvent(item.title) && nodes.get(id)?.type === 'company') nodes.get(id)!.materialEvent = true; }
    for (const id of linked) edge(id, item.id, item.kind === 'news' ? 'possibly relevant news' : 'research context', [contextEvidence(item)], item.relevance, true);
  }
  for(const p of aggregateProducts(a)){const node=nodes.get(p.id);if(node){node.evidence.unshift(productEvidence(a,p));node.description=`${a.weightsAvailable?percent(p.weight,2)+' combined exposure':'Combined weight unavailable'} across ${p.positions.length} positions. ${p.positions[0].instrumentType==='Investment fund'?lookThrough(p.positions[0]).reason:''} ${node.description}`;}}
  for (const node of nodes.values()) if (node.type === 'company') {
    const ownership = edges.filter(e => e.target === node.id && !e.inferred);
    const direct = ownership.some(e => nodes.get(e.source)?.type === 'portfolio');
    const fundCount = new Set(ownership.filter(e => nodes.get(e.source)?.type === 'fund').map(e => e.source)).size;
    node.description = `${a.weightsAvailable && direct?percent(aggregateProducts(a).find(p=>p.id===node.id)?.weight || 0,2)+' direct position exposure. ':''}` + (direct && fundCount ? `Held directly and through ${fundCount} expanded fund${fundCount === 1 ? '' : 's'}. The same verified ISIN connects these positions. Inspect the dated sources before combining exposure.` : direct ? 'Direct holding. Inspect each position source for its portfolio, value and weight.' : 'Underlying security from a dated fund snapshot. Indirect exposure is estimated; partial holdings are not normalized to 100%.');
  }
  return { nodes: [...nodes.values()], edges };
}

export function neighborhood(network: FinancialNetwork, ids: Set<string>, hops = 1): FinancialNetwork {
  const keep = new Set(ids);
  for (let i = 0; i < hops; i++) { const previous = new Set(keep); for (const e of network.edges) if (previous.has(e.source) || previous.has(e.target)) { keep.add(e.source); keep.add(e.target); } }
  return { nodes: network.nodes.filter(n => keep.has(n.id)), edges: network.edges.filter(e => keep.has(e.source) && keep.has(e.target)) };
}

// Follow only incoming evidence/ownership edges, without adding unrelated siblings.
export function ownershipTrace(network: FinancialNetwork, eventId: string): FinancialNetwork {
  const keep = new Set([eventId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of network.edges) {
      if (keep.has(edge.target) && (edge.target === eventId || !edge.inferred) && !keep.has(edge.source)) {
        keep.add(edge.source); changed = true;
      }
    }
  }
  return {nodes:network.nodes.filter(n=>keep.has(n.id)),edges:network.edges.filter(e=>keep.has(e.source)&&keep.has(e.target))};
}
