import { openSourcePdf } from './lib/importStorage';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, ChevronRight, FileText, Fingerprint, Focus, Layers3, Network, Plus, Minus, ShieldCheck, X } from 'lucide-react';
import type { Analysis, Entity, Evidence, Finding } from './lib/types';
import { dateLabel, money, percent, shortName } from './lib/format';

export const palette = ['#3f7deb', '#60b5a0', '#a99adc', '#e5b45d', '#97adc6', '#d0d9e4'];

export function HistoryChart({ analysis, large = false }: { analysis: Analysis; large?: boolean }) {
  const id = useId().replaceAll(':', '');
  const data = analysis.history;
  if (data.length < 2) return <div className="empty-chart"><Layers3 size={24} /><p>Value history is unavailable in this scope.</p><span>Select a portfolio with compatible history.</span></div>;
  const values = data.map(d => d.value); const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1;
  const width = 560; const height = large ? 175 : 110;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 16 - (v - min) / span * (height - 32)}`);
  const color = values.at(-1)! < values[0] ? 'var(--negative, #bc3943)' : 'var(--positive, #237963)';
  const line = `M${points.join(' L')}`;
  return <div className={`history-chart ${large ? 'large' : ''}`}>
    <div className="chart-head"><div><span className="eyebrow">LATEST OBSERVATION</span><strong>{money(data.at(-1)!.value, analysis.historyCurrency)}</strong></div><span className="chart-date">{dateLabel(data.at(-1)!.date, true)}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Portfolio value history: ${money(data[0].value, analysis.historyCurrency)} to ${money(data.at(-1)!.value, analysis.historyCurrency)} across ${data.length} observations`}>
      <defs><linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".16" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {[.2,.5,.8].map(n => <line key={n} x1="0" x2={width} y1={height*n} y2={height*n} stroke="#e8edf3" strokeDasharray="3 5" />)}
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#fill-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={width} cy={Number(points.at(-1)!.split(',')[1])} r="4" fill={color} />
    </svg>
    <div className="chart-axis"><span>{dateLabel(data[0].date, true)}</span><span>{data.length} observations</span></div>
    <p className="microcopy">Portfolio value, including possible cash flows. Not investment return.</p>
  </div>;
}

export function Allocation({ analysis }: { analysis: Analysis }) {
  const segments = analysis.allocations.filter(s => s.weight > 0);
  const visible = segments.length > 5 ? [...segments.slice(0, 5), { label: 'Other classifications', weight: segments.slice(5).reduce((n, s) => n + s.weight, 0) }] : segments;
  let offset = 0;
  return <div className="allocation">
    <div className="donut-wrap"><svg viewBox="0 0 180 180" role="img" aria-label="Portfolio composition by security classification">
      <circle cx="90" cy="90" r="69" stroke="#edf1f6" strokeWidth="17" fill="none" />
      {visible.map((s, i) => { const start = offset; offset += s.weight; return <circle key={s.label} cx="90" cy="90" r="69" fill="none" stroke={palette[i]} strokeWidth="17" pathLength="100" strokeDasharray={`${Math.max(0, s.weight*100-1)} ${100-Math.max(0,s.weight*100-1)}`} strokeDashoffset={-start*100} transform="rotate(-90 90 90)" />; })}
    </svg><div className="donut-label"><strong>{analysis.holdings.length}</strong><span>positions</span></div></div>
    <div className="allocation-legend">{visible.map((s, i) => <div key={s.label}><span className="legend-dot" style={{ background: palette[i] }} /><span>{s.label}</span><strong>{percent(s.weight)}</strong></div>)}</div>
    {!visible.length && <p className="muted">Composition data is unavailable.</p>}
  </div>;
}

export function FindingCard({ finding, selected, onSelect, onGraph, onEvidence }: { finding: Finding; selected: boolean; onSelect: () => void; onGraph: () => void; onEvidence: (source: Evidence) => void }) {
  return <article className={`finding-card ${finding.kind} ${selected ? 'selected' : ''}`} onClick={onSelect}>
    <div className="finding-top"><span className={`finding-tag ${finding.kind}`}><span />{finding.tag}</span><span className="evidence-count"><ShieldCheck size={13} />{finding.evidence.length} source{finding.evidence.length === 1 ? '' : 's'}</span></div>
    <h3>{finding.title}</h3><p>{finding.body}</p>
    <div className="finding-actions"><button onClick={e => { e.stopPropagation(); onGraph(); }}><Network size={14} />Explore connection<ArrowUpRight size={13} /></button>{finding.evidence[0] && <button className="source-link" onClick={e => { e.stopPropagation(); onEvidence(finding.evidence[0]); }}>View source<ChevronRight size={13} /></button>}</div>
  </article>;
}

const typeNames: Record<Entity['type'], string> = { client: 'CUSTOMER', portfolio: 'PORTFOLIO', holding: 'HOLDING', exposure: 'FUND EXPOSURE', note: 'CUSTOMER CONTEXT', proposal: 'ADVISORY HISTORY', issue: 'RECORDED ISSUE', metric: 'OBSERVATION' };

export function GraphView({ analysis, selected, onSelect, onEvidence, onBrief }: { analysis: Analysis; selected: Finding; onSelect: (id: string) => void; onEvidence: (s: Evidence) => void; onBrief: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [activeNode, setActiveNode] = useState<string>('');
  useEffect(() => { setZoom(1); setActiveNode(''); }, [selected.id, analysis.customer.ClientId, analysis.scope]);
  const levels = new Map<string, number>([['customer', 0]]);
  for (let i = 0; i < selected.entities.length; i++) for (const edge of selected.connections) if (levels.has(edge.from)) levels.set(edge.to, Math.max(levels.get(edge.to) ?? 0, levels.get(edge.from)! + 1));
  if (levels.has('other-funds')) levels.set('other-funds', 2);
  const maxLevel = Math.max(1, ...levels.values());
  const positions = new Map<string, { x: number; y: number }>();
  for (let level = 0; level <= maxLevel; level++) {
    const members = selected.entities.filter(n => (levels.get(n.id) ?? 1) === level);
    members.forEach((node, i) => positions.set(node.id, { x: 105 + level/maxLevel * 660, y: 65 + (i + .5)/members.length*420 }));
  }
  const active = selected.entities.find(e => e.id === activeNode);
  const activeEvidence = analysis.evidence.find(e => e.id === active?.evidenceId);
  return <div className="graph-page">
    <div className="graph-toolbar"><div><span className="eyebrow">CONNECTED CONTEXT</span><h2>See the bigger picture.</h2></div><label className="finding-select"><span>Explore a finding</span><select value={selected.id} onChange={e => onSelect(e.target.value)}>{analysis.findings.map(f => <option value={f.id} key={f.id}>{f.title}</option>)}</select></label></div>
    <div className="graph-layout"><div className="graph-canvas">
      <div className="graph-caption"><span className="live-dot" />Same facts. A different perspective.<span className="graph-scroll-hint">Swipe to explore →</span></div>
      <div className="graph-scroll"><svg viewBox="0 0 875 550" className="relationship-graph" aria-label={`Relationship graph: ${selected.title}`}>
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#adbed2" /></marker></defs>
        <g transform={`translate(${437.5*(1-zoom)},${275*(1-zoom)}) scale(${zoom})`}>
          {selected.connections.map((edge, i) => { const a = positions.get(edge.from); const b = positions.get(edge.to); if (!a || !b) return null; const x1 = a.x+82, x2 = b.x-88; return <g key={i}><path d={`M ${x1} ${a.y} C ${(x1+x2)/2} ${a.y}, ${(x1+x2)/2} ${b.y}, ${x2} ${b.y}`} fill="none" stroke="#b9cadd" strokeWidth="1.6" markerEnd="url(#arrow)" /><text x={(x1+x2)/2} y={(a.y+b.y)/2-12} textAnchor="middle" className="edge-label">{edge.label.length > 22 ? edge.label.replace('contributes exposure','exposure').replace('has a recorded issue','recorded issue').replace('next monthly observation','next observation') : edge.label}</text></g>; })}
          {selected.entities.map(node => { const pos = positions.get(node.id)!; const title = shortName(node.label, 43); const words = title.split(' '); let l1 = '', l2 = ''; for (const word of words) { if ((l1+' '+word).trim().length < 24 && !l2) l1 = (l1+' '+word).trim(); else l2 = (l2+' '+word).trim(); } return <g key={node.id} role="button" tabIndex={0} aria-label={`${node.label}: ${node.value || typeNames[node.type]}`} className={`graph-node ${node.type} ${activeNode === node.id ? 'active' : ''}`} transform={`translate(${pos.x-85},${pos.y-48})`} onClick={() => setActiveNode(node.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveNode(node.id); } }}>
            <rect width="170" height="96" rx="13" className="node-bg" /><rect x="13" y="14" width="5" height="5" rx="2.5" className="node-dot" /><text x="25" y="20" className="node-type">{typeNames[node.type]}</text><text x="13" y="43" className="node-title">{l1}</text>{l2 && <text x="13" y="59" className="node-title">{shortName(l2, 24)}</text>}<text x="13" y="81" className="node-value">{shortName(node.value || 'Explore source', 29)}</text>
          </g>; })}
        </g>
      </svg></div>
      <div className="graph-bottom"><div className="graph-legend"><span><i />Source relationship</span><span><i className="teal" />Calculated exposure</span></div><div className="zoom-controls"><button aria-label="Zoom out" onClick={() => setZoom(z => Math.max(.65, z-.15))}><Minus size={16} /></button><button aria-label="Reset graph zoom" onClick={() => { setZoom(1); setActiveNode(''); }}><Focus size={16} /></button><button aria-label="Zoom in" onClick={() => setZoom(z => Math.min(1.6, z+.15))}><Plus size={16} /></button></div></div>
    </div><aside className="graph-inspector"><span className={`finding-tag ${selected.kind}`}><span />{active ? typeNames[active.type] : selected.tag}</span><h3>{active ? active.label : selected.title}</h3>{active?.value && <div className="inspector-value">{active.value}</div>}<p>{active ? activeEvidence?.note || (active.type === 'client' ? 'The selected customer. All connected records belong to this customer and the selected portfolio scope.' : 'Select a linked source to inspect the underlying data.') : selected.body}</p>
      {activeEvidence ? <button className="button secondary wide" onClick={() => onEvidence(activeEvidence)}><FileText size={15} />Open source<ArrowUpRight size={14} /></button> : !active && <div className="source-list">{selected.evidence.map(s => <button key={s.id} onClick={() => onEvidence(s)}><FileText size={15} /><span>{shortName(s.title, 50)}<small>{s.type === 'calculation' ? 'Calculation & inputs' : 'Source record'}</small></span><ChevronRight size={14} /></button>)}</div>}
      <div className="graph-question"><span className="eyebrow">A QUESTION TO TAKE FORWARD</span><p>{selected.question}</p></div><button className="text-button" onClick={onBrief}><BookOpen size={15} />Return to the brief<ArrowUpRight size={14} /></button>
    </aside></div>
    <div className="graph-note"><Fingerprint size={15} /><span>Connections explain the source data. They do not establish market causality.</span></div>
  </div>;
}

export function EvidenceDrawer({ evidence, onClose }: { evidence: Evidence; onClose: () => void }) {
  const [documentError,setDocumentError]=useState('');
  useEffect(()=>setDocumentError(''),[evidence.id]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const focusable = [...(drawerRef.current?.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]') || [])];
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); previous?.focus(); };
  }, [onClose]);
  return <div className="drawer-overlay" onClick={onClose}><aside ref={drawerRef} className="evidence-drawer" role="dialog" aria-modal="true" aria-labelledby="evidence-title" onClick={e => e.stopPropagation()}><div className="drawer-top"><span className="eyebrow"><ShieldCheck size={15} /> EVIDENCE</span><button ref={closeRef} className="icon-button" onClick={onClose} aria-label="Close evidence"><X size={20} /></button></div><div className="source-type">{evidence.type === 'calculation' ? 'Calculated from source data' : /^https?:\/\//.test(evidence.location) ? 'External source' : 'Supplied source record'}</div><h2 id="evidence-title">{evidence.title}</h2>{evidence.date && <p className="muted">Recorded {dateLabel(evidence.date)}</p>}<div className="evidence-fields">{evidence.fields.map((field, i) => <div key={i}><span>{field.label}</span><p>{field.value}</p></div>)}</div><div className="source-location"><FileText size={17} /><div><span className="eyebrow">SOURCE LOCATION</span><code>{/^https?:\/\//.test(evidence.location) ? <a href={evidence.location} target="_blank" rel="noreferrer">Open original source ↗</a> : evidence.location}</code></div></div>{evidence.document && <button className="button secondary" onClick={()=>void openSourcePdf(evidence.document!.hash,evidence.document!.page).catch(e=>setDocumentError(e.message))}>Open PDF · page {evidence.document.page}</button>}{documentError&&<p role="alert">{documentError}</p>}{evidence.note && <div className="source-note"><Fingerprint size={18} /><p>{evidence.note}</p></div>}<p className="drawer-footer">{evidence.document ? 'Original external custody statement. Its valuation date is preserved; these values have not been repriced.' : /^https?:\/\//.test(evidence.location) ? 'External source with its own publication date. This is separate from the shifted case-data timeline.' : 'Source: UNRISKOMEGA case dataset. Most exported dates are shifted. Account identifiers are excluded.'}</p></aside></div>;
}
