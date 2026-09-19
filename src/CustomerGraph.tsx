import { lookThrough } from './lib/advisory';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Expand, FileText, Minus, Plus, RefreshCw, Search, X } from 'lucide-react';
import RawGraph, { COLORS } from './network/Graph';
import { buildNetwork, neighborhood, ownershipTrace, type NetworkNode, type NetworkEdge } from './lib/network';
import { instrumentId, type ContextItem, type MarketContext } from './lib/briefing';
import type { Analysis, Evidence, Finding } from './lib/types';
import type { FundLookupState } from './FundGraph';
import { dateLabel, percent } from './lib/format';

const Graph = RawGraph as React.ForwardRefExoticComponent<{ nodes: NetworkNode[]; edges: NetworkEdge[]; layoutKey: string; selectedId: string | null; selectedEdgeId: string | null; onSelect: (id: string | null) => void; onEdgeSelect: (id: string) => void } & React.RefAttributes<{ fit: () => void; zoom: (n: number) => void }>>;

export function CustomerGraph({ analysis, selected, overview, onOverview, onSelect, onEvidence, onBrief, fundStatus, onRefreshFund, context, contextFocus, nodeFocus, onDiscuss }: {
  analysis: Analysis; selected: Finding; overview: boolean; onOverview: () => void; onSelect: (id: string) => void; onEvidence: (e: Evidence) => void; onBrief: () => void;
  fundStatus: Record<string, FundLookupState>; onRefreshFund: (isin: string) => void; context?: MarketContext; contextFocus?: string; nodeFocus?: string; onDiscuss?: (item: ContextItem) => void;
}) {
  const scopeKey = `${analysis.customer.ClientId}:${analysis.scope}`;
  const [expanded, setExpanded] = useState(new Set<string>());
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const [query, setQuery] = useState(''); const [local, setLocal] = useState(false);
  const [layers, setLayers] = useState({ issues: false, sectors: false, countries: false, regions: false, news: true });
  const graph = useRef<{ fit: () => void; zoom: (n: number) => void } | null>(null);
  useEffect(() => { setExpanded(new Set()); setNodeId(null); setEdgeId(null); setQuery(''); setLocal(false); }, [scopeKey]);
  useEffect(() => {
    if (!contextFocus) return;
    const item = context?.items.find(i => i.id === contextFocus); if (!item) return;
    const funds = analysis.holdings.filter(h => h.fundHoldings?.holdings.some((c, i) => item.entityIds.includes(instrumentId(c.isin, `underlying:${h.isin || h.id}:${i}`))));
    setExpanded(old => new Set([...old, ...funds.map(h => instrumentId(h.isin, h.id))])); setLayers(l => ({ ...l, news: true, sectors: item.entityIds.some(id => id.startsWith('sector:')) || l.sectors, countries: item.entityIds.some(id => id.startsWith('country:')) || l.countries, regions: item.entityIds.some(id => id.startsWith('region:')) || l.regions })); setNodeId(contextFocus); setLocal(true);
  }, [contextFocus, context, scopeKey]);
  useEffect(() => {
    if (!nodeFocus) return;
    setLayers(l=>({...l,countries:nodeFocus.startsWith('country:')||l.countries,sectors:nodeFocus.startsWith('sector:')||l.sectors,regions:nodeFocus.startsWith('region:')||l.regions}));
    const funds = analysis.holdings.filter(h => instrumentId(h.isin,h.id) === nodeFocus || h.fundHoldings?.holdings.some((c,i) => instrumentId(c.isin, `underlying:${h.isin || h.id}:${i}`) === nodeFocus));
    setExpanded(old => new Set([...old,...funds.map(h=>instrumentId(h.isin,h.id))]));setNodeId(nodeFocus);setEdgeId(null);setLocal(true);
  },[nodeFocus,scopeKey]);
  const network = useMemo(() => buildNetwork(analysis, expanded, context), [analysis, expanded, context]);
  const findingIds = useMemo(() => new Set(selected.entities.map(e => {
    const h = analysis.holdings.find(h => h.id === e.id);
    return h ? instrumentId(h.isin, h.id) : e.id === 'sector' ? `sector:${e.label}` : e.id;
  })), [selected, analysis]);
  const visible = useMemo(() => {
    if (!overview && !contextFocus) {
      return { nodes: network.nodes.filter(n => findingIds.has(n.id)), edges: network.edges.filter(e => findingIds.has(e.source) && findingIds.has(e.target)) };
    }
    const nodes = network.nodes.filter(n => n.type === 'issue' ? layers.issues : n.type === 'sector' ? layers.sectors : n.type === 'country' ? layers.countries : n.type === 'region' ? layers.regions : ['news', 'house-view'].includes(n.type) ? layers.news : true);
    const ids = new Set(nodes.map(n => n.id));
    const edges = network.edges.filter(e => ids.has(e.source) && ids.has(e.target));
    const connected = new Set(edges.flatMap(e => [e.source, e.target]));
    const filtered = { nodes: nodes.filter(n => !['news', 'house-view'].includes(n.type) || connected.has(n.id)), edges };
    return local && nodeId ? (network.nodes.some(n=>n.id===nodeId && n.type==='news') ? ownershipTrace(network,nodeId) : neighborhood(filtered, new Set([nodeId]), 1)) : filtered;
  }, [network, layers, overview, findingIds, local, nodeId, contextFocus]);
  const node = visible.nodes.find(n => n.id === nodeId);
  const edge = network.edges.find(e => e.id === edgeId);
  const held=analysis.holdings.find(h=>instrumentId(h.isin,h.id)===node?.id);
  const applicability=held?lookThrough(held):undefined;
  const lookup = node?.isin ? fundStatus[node.isin] : undefined;
  const matches = query.trim() ? network.nodes.filter(n => `${n.name} ${n.isin || ''}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : [];
  const select = (id: string | null) => { setNodeId(id); setEdgeId(null); };
  function reveal(id: string) { const n = network.nodes.find(n => n.id === id); if (n) setLayers(l => ({ ...l, issues: n.type === 'issue' || l.issues, sectors: n.type === 'sector' || l.sectors, countries: n.type === 'country' || l.countries, regions: n.type === 'region' || l.regions, news: ['news', 'house-view'].includes(n.type) || l.news })); onOverview(); select(id); setQuery(''); }
  return <section className="network-workspace">
    <div className="network-heading"><div><span className="eyebrow">FOLLOW THE CONNECTIONS</span><h2>The customer’s financial world</h2><p>Explore ownership, look inside funds, and trace every source.</p></div><button className="button secondary" onClick={onBrief}><ArrowLeft size={15} />Back to brief</button></div>
    {!overview && !contextFocus && <div className="network-insight"><span><strong>{selected.title}</strong> · Related evidence and its neighbors</span><button className="text-button" onClick={onOverview}>Show full network <X size={14}/></button></div>}
    <div className="network-toolbar"><div className="network-search"><Search size={15} /><input aria-label="Search network" placeholder="Find a company, fund, or exposure…" value={query} onChange={e => setQuery(e.target.value)} />{query && <div className="network-results">{matches.map(n => <button key={n.id} onClick={() => reveal(n.id)}><i style={{ background: (COLORS as Record<string, string>)[n.type] }} />{n.name}<small>{n.type}</small></button>)}{!matches.length && <p>No match in the visible or expanded data.</p>}</div>}</div><div className="network-layers">{Object.entries(layers).map(([key, enabled]) => <label key={key}><input type="checkbox" checked={enabled} onChange={e => { onOverview(); setLayers(l => ({ ...l, [key]: e.target.checked })); }} />{key}</label>)}</div><span className="network-count">{visible.nodes.length} / {network.nodes.length} nodes</span></div>
    <div className="network-body"><div className="network-map"><Graph ref={graph} nodes={visible.nodes} edges={visible.edges} layoutKey={scopeKey} selectedId={nodeId} selectedEdgeId={edgeId} onSelect={select} onEdgeSelect={(id: string) => { setEdgeId(id); setNodeId(null); }} /><div className="network-controls"><button aria-label="Zoom in" onClick={() => graph.current?.zoom(1.3)}><Plus size={16}/></button><button aria-label="Zoom out" onClick={() => graph.current?.zoom(1/1.3)}><Minus size={16}/></button><button aria-label="Fit network" onClick={() => graph.current?.fit()}><Expand size={16}/></button></div><div className="network-legend">{[...new Set(visible.nodes.map(n => n.type))].map(type => <span key={type}><i style={{ background: (COLORS as Record<string, string>)[type] }}/>{type}</span>)}<span><i style={{background:COLORS.issue}}/>Event / issue to verify</span><span>┄ inferred relevance</span></div></div>
    <aside className="network-inspector">{node ? <><div className="inspector-label"><span className="eyebrow">{node.materialEvent ? 'MATERIAL HEADLINE — VERIFY' : node.type === 'company' ? 'COMPANY SECURITY' : node.type}</span><button className="icon-button" aria-label="Clear selection" onClick={() => select(null)}><X size={15}/></button></div><h3>{node.name}</h3>{node.type==='news' && onDiscuss && <button className="button primary" onClick={()=>{const item=context?.items.find(i=>i.id===node.id);if(item)onDiscuss(item);}}>Discuss this event ↗</button>}<p>{node.description}</p>{node.isin && <code>{node.isin}</code>}<button className="button secondary inspector-focus" onClick={() => { setLocal(!local); onOverview(); }}>{local ? 'Show whole network' : 'Focus on connections'}</button>
      {node.type === 'fund' && <div className="fund-expansion"><h4>Inside this fund</h4>{node.snapshot ? <><p>{node.snapshot.holdings.length} published holdings · {dateLabel(node.snapshot.asOf, true)}</p><div className="coverage-track"><span style={{ width: `${node.snapshot.holdings.reduce((s, h) => s+h.weight, 0)*100}%` }}/></div><small>{percent(node.snapshot.holdings.reduce((s, h) => s+h.weight, 0))} covered · {percent(Math.max(0, 1-node.snapshot.holdings.reduce((s, h) => s+h.weight, 0)))} not shown</small><button className="button primary" onClick={() => setExpanded(old => { const next = new Set(old); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })}>{expanded.has(node.id) ? 'Collapse constituents' : 'Expand top 10 constituents'}</button><a className="text-button" href={node.snapshot.sourceUrl} target="_blank" rel="noreferrer">{node.snapshot.sourceName} ↗</a></> : <p>{lookup?.status === 'loading' ? 'Looking up a dated holdings list…' : applicability?.reason || 'Constituents unavailable. Category exposures remain available where supplied.'}</p>}{node.isin && applicability?.status!=='not-applicable' && <button className="text-button" disabled={lookup?.status === 'loading'} onClick={() => onRefreshFund(node.isin!)}><RefreshCw size={13}/>{lookup?.status === 'loading' ? 'Fetching…' : 'Refresh holdings'}</button>}{lookup?.status === 'unavailable' && <p className="microcopy">{lookup.message} {node.snapshot ? 'The saved snapshot is retained.' : ''}</p>}</div>}
      <div className="inspector-sources"><h4>Evidence & positions</h4>{node.evidence.map(e => <button key={e.id} onClick={() => onEvidence(e)}><FileText size={14}/><span>{e.title}<small>{e.date ? dateLabel(e.date, true) : e.type === 'calculation' ? 'Calculation' : 'Supplied record'}</small></span>↗</button>)}{!node.evidence.length && <p className="microcopy">Select a connected record to inspect its source.</p>}</div><div className="inspector-links"><h4>{network.edges.filter(e => e.source === node.id || e.target === node.id).length} connections</h4>{network.edges.filter(e => e.source === node.id || e.target === node.id).map(e => <button key={e.id} onClick={() => { setEdgeId(e.id); setNodeId(null); }}>{e.labels.join(' · ')}<small>{network.nodes.find(n => n.id === (e.source === node.id ? e.target : e.source))?.name}</small></button>)}</div>
    </> : edge ? <><span className="eyebrow">{edge.inferred ? 'INFERRED RELEVANCE' : 'SOURCE RELATIONSHIP'}</span><h3>{edge.labels.join(' · ')}</h3><p>{edge.detail}</p><div className="inspector-links">{[edge.source, edge.target].map(id => <button key={id} onClick={() => reveal(id)}>{network.nodes.find(n => n.id === id)?.name} ↗</button>)}</div>{edge.evidence.map(e => <button className="text-button" key={e.id} onClick={() => onEvidence(e)}>Inspect {e.title} ↗</button>)}</> : <><span className="eyebrow">YOUR MAP, EXPLAINED</span><h3>Start with a connection.</h3><p>Click a fund to reveal its top ten holdings. Shared verified ISINs join direct positions and fund constituents in one node.</p><div className="inspector-tip"><strong>A map of evidence</strong><p>Node size reflects connection count, not investment size. Dotted links show inferred news relevance. Clusters do not imply correlation.</p></div><h4>Explore a brief finding</h4><div className="inspector-links">{analysis.findings.filter(f => f.id !== 'customer-context').map(f => <button key={f.id} onClick={() => onSelect(f.id)}>{f.title}<small>{f.tag}</small></button>)}</div></>}
    </aside></div>
  </section>;
}
