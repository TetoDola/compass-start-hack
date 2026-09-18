// Identity colors are stable across graph, tables and legends. Severity is a separate label.
export const COLORS: Record<string, string> = { client: '#28564a', portfolio: '#54766c', fund: '#6555b5', company: '#2475bd', instrument: '#64748b', note: '#957243', issue: '#bc3943', news: '#087f8c', sector: '#bd7a16', country: '#a7559b', region: '#a7559b', 'house-view': '#7e658c', proposal: '#64823e', metric: '#64748b' };
export const statusColors = { critical: '#bc3943', review: '#a6680b', gap: '#64748b', positive: '#237963', negative: '#bc3943' };
export const dimensionColor = (kind: string) => COLORS[kind === 'industry' ? 'sector' : kind] || COLORS.instrument;
