import type { Analysis, Connection, Dataset, Entity, Evidence, Finding, Holding, Row } from './types';
import { dateLabel, list, money, number, percent, redact, statusLabel } from './format';

import { displayInstrumentName } from './instruments';

const sumKnown = (values: unknown[]) => values.length && values.every(v => number(v) != null)
  ? values.reduce<number>((sum, v) => sum + (v as number), 0) : null;
const validDate = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const sortRecent = (key: string) => (a: Row, b: Row) => (Date.parse(b[key]) || 0) - (Date.parse(a[key]) || 0);
const fields = (entries: Record<string, string>) => Object.entries(entries).map(([label, value]) => ({ label, value }));

export function analyze(dataset: Dataset, customer: Row, scope = 'all'): Analysis {
  const allPortfolios = list(customer.Portfolios);
  const portfolios = scope === 'all' ? allPortfolios : allPortfolios.filter(p => String(p.PortfolioId) === scope);
  const currency = customer.ReportingCurrency || 'CHF';
  const scopeAmbiguous = portfolios.length > 1 && portfolios.some(p => p.IsConsolidated === true || /consolid|konsolid/i.test(`${p.Name || ''} ${p.PortfolioNr || ''}`));
  const aum = scopeAmbiguous ? null : sumKnown(portfolios.map(p => p.AssetsUnderManagementInDefaultCurrency));
  const liquidity = scopeAmbiguous ? null : sumKnown(portfolios.map(p => p.LiquidityInDefaultCurrency));
  const weightsAvailable = !scopeAmbiguous && (portfolios.length === 1 || (aum != null && aum > 0));
  const securities = new Map(dataset.reference.Securities.map(s => [s.Id, s]));
  const funds = new Map(dataset.reference.FundBreakdowns.map(f => [f.id, f]));
  const fundHoldings = new Map((dataset.reference.FundHoldings || []).map(f => [f.isin, f]));
  const portfolioIds = new Set(portfolios.map(p => p.PortfolioId));
  const allIds = new Set(allPortfolios.map(p => p.PortfolioId));
  const violations = list(customer.SuitabilityViolations).filter(v => portfolioIds.has(v.PortfolioId));
  const proposals = list(customer.Proposals).filter(p => portfolioIds.has(p.PortfolioId)).sort(sortRecent('ProposedDateUTC'));
  const unresolved = [...list(customer.SuitabilityViolations), ...list(customer.Proposals)].filter(r => !allIds.has(r.PortfolioId)).length;
  const seenNotes = new Set<string>();
  const notes = list(customer.ClientNotes).filter(n => typeof n.Note === 'string' && n.Note.trim() && n.Note !== 'Comment').sort(sortRecent('CreatedByDateUTC')).filter(n => {
    if (seenNotes.has(n.Note)) return false;
    seenNotes.add(n.Note); return true;
  });
  const evidence: Evidence[] = [];
  const holdings: Holding[] = [];
  const allocations = new Map<string, number>();
  const sectors = new Map<string, number>();
  let fundCoverage = 0;
  const warnings: string[] = [];
  const root: Entity = { id: 'customer', label: customer.ClientRef || 'Customer', type: 'client', value: `${portfolios.length} portfolio${portfolios.length === 1 ? '' : 's'}` };
  const portfolioEntity = (p: Row): Entity => ({ id: `p-${p.PortfolioId}`, label: p.PortfolioNr || 'Portfolio', value: p.StrategyName || 'Strategy not recorded', type: 'portfolio', evidenceId: `p-${p.PortfolioId}` });
  const holdingEntity = (h: Holding): Entity => ({ id: h.id, label: h.name, value: percent(h.weight), type: 'holding', evidenceId: h.evidence.id });
  const add = (map: Map<string, number>, key: string, value: number) => map.set(key, (map.get(key) || 0) + value);
  const basePath = `clients.json / ${customer.ClientRef}`;
  if (scopeAmbiguous) warnings.push('A consolidated view may overlap another portfolio. Combined totals, history and exposure weights are unavailable. Select one portfolio to continue.');
  if (unresolved) warnings.push(`${unresolved} advisory record${unresolved === 1 ? '' : 's'} reference a portfolio missing from this customer export. They are excluded from portfolio findings.`);
  if (!portfolios.length) warnings.push('No portfolio data is available for this customer.');
  if (aum == null && portfolios.length > 1 && !scopeAmbiguous) warnings.push('Some portfolio values are missing. Combined exposure weights are unavailable; select an individual portfolio.');

  for (const p of portfolios) {
    const factor = portfolios.length === 1 ? 1 : aum != null && aum > 0 ? (number(p.AssetsUnderManagementInDefaultCurrency) || 0) / aum : 0;
    evidence.push({ id: `p-${p.PortfolioId}`, type: 'record', title: p.PortfolioNr || 'Portfolio', location: `${basePath} / Portfolios[PortfolioId=${p.PortfolioId}]`, date: p.FactoryDateUtc, fields: fields({ 'Reported assets': money(number(p.AssetsUnderManagementInDefaultCurrency), currency), 'Reported liquidity': money(number(p.LiquidityInDefaultCurrency), currency), 'Portfolio currency': p.PortfolioCurrency || 'Not recorded', Strategy: p.StrategyName || 'Not recorded', 'Supplied volatility': number(p.Volatility) != null ? percent(p.Volatility) : 'Not available' }), note: 'Assets and liquidity use the customer reporting currency. Risk figures are supplied snapshot outputs, not recalculated.' });
    for (const [i, s] of list(p.SecurityPositions).entries()) {
      const master = securities.get(s.SecurityId);
      const isin = master?.Isin || s.Isin || s.SecurityIsin;
      const instrumentType = master?.SecurityTypeName || s.SecurityTypeName || 'Unknown instrument';
      const weight = (number(s.PortfolioValuePercentage) || 0) * factor;
      const id = `holding-${p.PortfolioId}-${i}`;
      const source: Evidence = { id, title: redact(s.SecurityName || master?.Name || 'Unresolved security'), type: 'record', location: `${basePath} / Portfolios[PortfolioId=${p.PortfolioId}] / SecurityPositions[${i}]`, fields: fields({ 'Security ID': String(s.SecurityId ?? 'Missing'), 'Position value': money(number(s.TotalAmountInPortfolioCurrency), p.PortfolioCurrency || currency), 'Portfolio weight': number(s.PortfolioValuePercentage) != null ? percent(s.PortfolioValuePercentage) : 'Not available', Quantity: String(s.Quantity ?? 'Not available'), 'Instrument type': instrumentType, 'ISIN': isin || 'Not recorded', 'Price date': dateLabel(master?.PriceDateUtc || s.PriceDateUtc), 'Security classification': master?.SAA_AssetClassName || 'Not classified', Industry: master?.IndustryName || 'Not classified', 'Reference country': master?.CountryName || 'Not classified' }), note: master ? 'Position joined to reference.json / Securities using SecurityId.' : 'This security is absent from the supplied reference file. Its position values are retained.' };
      const holding: Holding = { id, name: source.title, securityId: s.SecurityId, portfolioId: p.PortfolioId, portfolio: p.PortfolioNr || String(p.PortfolioId), currency: p.PortfolioCurrency || currency, value: number(s.TotalAmountInPortfolioCurrency), weight, asset: master?.SAA_AssetClassName || 'Not classified', sector: master?.IndustryName || 'Not classified', country: master?.CountryName, known: !!master, evidence: source, priceDate: master?.PriceDateUtc || s.PriceDateUtc, priceStale: !validDate(master?.PriceDateUtc || s.PriceDateUtc) || Date.now() - Date.parse(master?.PriceDateUtc || s.PriceDateUtc) > 30 * 86400000, instrumentType, displayName: fundHoldings.get(isin)?.name || displayInstrumentName(source.title, instrumentType), isin, fundBreakdown: funds.get(s.SecurityId), fundHoldings: instrumentType === 'Investment fund' ? fundHoldings.get(isin) : undefined };
      holdings.push(holding); evidence.push(source); add(allocations, holding.asset, weight);
      const fund = funds.get(s.SecurityId);
      if (fund && fund.total > 0) {
        fundCoverage += weight;
        for (const [category, value] of Object.entries(fund.sectors)) add(sectors, category, weight * value / fund.total);
      }
    }
    for (const account of list(p.AccountPositions)) {
      const fiat = ['CHF','EUR','USD','GBP','JPY','CAD','AUD','NZD','SEK','NOK','DKK','SGD','HKD'].includes(account.Currency);
      add(allocations, fiat ? 'Cash accounts' : 'Other accounts', (number(account.PortfolioValuePercentage) || 0) * factor);
    }
  }
  holdings.sort((a, b) => b.weight - a.weight);
  const unknownCount = holdings.filter(h => !h.known).length;
  if (unknownCount) warnings.push(`${unknownCount} holding${unknownCount === 1 ? '' : 's'} have no matching security reference. Classifications remain unknown.`);
  const fundSectors = [...sectors].map(([label, weight]) => ({ label, weight })).sort((a, b) => b.weight - a.weight);
  const historyCurrency = portfolios.length === 1 ? portfolios[0].PortfolioCurrency || currency : currency;
  let history: Analysis['history'] = [];
  if (!scopeAmbiguous && (portfolios.length === 1 || (portfolios.length > 1 && portfolios.every(p => p.PortfolioCurrency === currency)))) {
    const maps = portfolios.map(p => new Map(list(p.PerformanceHistory).filter(h => validDate(h.Date) && number(h.Value) != null).map(h => [h.Date as string, h.Value as number])));
    if (maps.length) history = [...maps[0]].filter(([date]) => maps.every(m => m.has(date))).map(([date]) => ({ date, value: maps.reduce((sum, m) => sum + m.get(date)!, 0) })).sort((a, b) => a.date.localeCompare(b.date));
  } else if (portfolios.length > 1 && !scopeAmbiguous) warnings.push('Portfolio histories use different currencies. Select a portfolio to see its value history.');

  const findings: Finding[] = [];
  const noteEvidence = notes.map((n, i): Evidence => ({ id: `note-${i}`, title: 'Recorded customer context', type: 'record', date: n.CreatedByDateUTC, location: `${basePath} / ClientNotes / CreatedByDateUTC=${n.CreatedByDateUTC || "undated"}`, fields: fields({ Note: redact(n.Note), 'Recorded date': dateLabel(n.CreatedByDateUTC) }), note: 'Recorded context, not a transcript. Dates are shifted; time-sensitive needs require confirmation.' }));
  evidence.push(...noteEvidence);
  const rankedNotes = notes.map((n, i) => ({ note: n, source: noteEvidence[i], score: notePriority(n.Note) })).sort((a, b) => b.score - a.score);
  const primaryNote = rankedNotes[0];
  if (primaryNote) {
    const { note, source } = primaryNote;
    const liquidityContext = /liquid|tax|withdraw|house purchase|cash need/i.test(note.Note);
    findings.push({ id: 'customer-context', section: 'happened', kind: 'context', tag: 'Customer context', title: liquidityContext ? 'A recorded cash need to reconfirm' : 'Customer priorities to carry forward', body: `${redact(note.Note)} Recorded ${dateLabel(note.CreatedByDateUTC, true)}; confirm whether this still applies.`, question: liquidityContext ? 'Confirm whether the recorded cash need remains outstanding, its amount and deadline; then review available liquidity before preparing funding options.' : 'Confirm the recorded preference and use it to review the relevant holdings and next proposal.', evidence: [source], entities: [root, { id: source.id, label: 'Recorded customer context', value: dateLabel(note.CreatedByDateUTC, true), type: 'note', evidenceId: source.id }], connections: [{ from: 'customer', to: source.id, label: 'has a recorded note' }] });
  }
  const latest = proposals[0];
  if (latest) {
    const source: Evidence = { id: `proposal-${latest.ProposalId}`, title: 'Existing advisory proposal', type: 'record', location: `${basePath} / Proposals[ProposalId=${latest.ProposalId}]`, date: latest.ProposedDateUTC, fields: fields({ Reason: redact(latest.Reason || 'Not recorded'), Status: statusLabel(latest.ProposalStatusName), Proposed: dateLabel(latest.ProposedDateUTC), 'Portfolio ID': String(latest.PortfolioId) }), note: 'The status is the exported status. It does not establish execution, or the reason for rejection.' };
    evidence.push(source);
    findings.push({ id: 'proposal-history', section: 'happened', kind: 'context', tag: 'Advisory history', title: `${statusLabel(latest.ProposalStatusName)} proposal on record`, body: `${redact(latest.Reason || 'An investment proposal')}${validDate(latest.ProposedDateUTC) ? `, proposed on ${dateLabel(latest.ProposedDateUTC, true)}` : ''}. There ${proposals.length === 1 ? 'is 1 proposal' : `are ${proposals.length} proposals`} in the selected scope.`, question: latest.ProposalStatusName === 'Abgelehnt' ? 'What has changed since the previous proposal, and should its rationale be revisited?' : 'Does the existing proposal still address the customer’s current priorities?', evidence: [source], entities: [root, { id: 'proposal', label: redact(latest.Reason || 'Investment proposal'), value: statusLabel(latest.ProposalStatusName), type: 'proposal', evidenceId: source.id }], connections: [{ from: 'customer', to: 'proposal', label: 'has advisory history' }] });
  }
  if (history.length >= 2) {
    const last = history.at(-1)!; const before = history.at(-2)!;
    const delta = before.value > 0 ? last.value / before.value - 1 : null;
    if (delta != null) {
      const source: Evidence = { id: 'history-change', title: 'Latest monthly value change', type: 'calculation', location: `${basePath} / Portfolios / PerformanceHistory`, date: last.date, fields: fields({ 'Previous observation': `${money(before.value, historyCurrency)} · ${dateLabel(before.date, true)}`, 'Latest observation': `${money(last.value, historyCurrency)} · ${dateLabel(last.date, true)}`, Formula: '(latest value ÷ previous value − 1) × 100', Change: percent(delta) }), note: 'This is portfolio-value movement, not a cash-flow-adjusted return. The history dates are shifted fixture dates.' };
      evidence.push(source);
      findings.push({ id: 'value-development', section: 'happened', kind: 'context', tag: 'Value development', metric: `${delta >= 0 ? '+' : ''}${percent(delta)}`, title: `Portfolio value ${delta >= 0 ? 'rose' : 'fell'} ${percent(Math.abs(delta))} in the latest interval`, body: `${money(before.value, historyCurrency)} → ${money(last.value, historyCurrency)} across the latest two monthly observations. This can include cash flows; it is not an investment-return measure.`, question: 'Were there deposits or withdrawals that help explain the movement in portfolio value?', evidence: [source], entities: [root, { id: 'previous-value', label: 'Previous observation', value: money(before.value, historyCurrency), type: 'metric', evidenceId: source.id }, { id: 'latest-value', label: 'Latest observation', value: money(last.value, historyCurrency), type: 'metric', evidenceId: source.id }], connections: [{ from: 'customer', to: 'previous-value', label: 'reported value' }, { from: 'previous-value', to: 'latest-value', label: 'next monthly observation' }] });
    }
  }
  if (violations.length) {
    const selected = [...violations].sort((a, b) => Number(b.Severity === 'Error') - Number(a.Severity === 'Error')).slice(0, 2);
    const sources = selected.map(v => ({ id: `issue-${v.Id}`, title: v.RuleCode || 'Recorded suitability issue', type: 'record' as const, location: `${basePath} / SuitabilityViolations[Id=${v.Id}]`, date: v.LastViolatedDateUTC, fields: fields({ Rule: v.RuleCode || 'Not recorded', Description: v.RuleDescription || 'Not supplied', 'Violation path': v.ViolationPath || 'Not supplied', Severity: v.Severity || 'Not recorded', 'Portfolio ID': String(v.PortfolioId) }), note: 'A supplied rule-engine finding. It has not been recomputed against a new portfolio or date.' }));
    evidence.push(...sources);
    const involved = portfolios.filter(p => selected.some(v => v.PortfolioId === p.PortfolioId));
    const entities: Entity[] = [root, ...involved.map(portfolioEntity), ...sources.map(s => ({ id: s.id, label: s.title, value: 'Recorded finding', type: 'issue' as const, evidenceId: s.id }))];
    const connections: Connection[] = [...involved.map(p => ({ from: 'customer', to: `p-${p.PortfolioId}`, label: 'owns' })), ...selected.map(v => ({ from: `p-${v.PortfolioId}`, to: `issue-${v.Id}`, label: 'has a recorded issue' }))];
    findings.push({ id: 'recorded-issues', section: 'now', kind: 'attention', tag: 'Review point', metric: String(violations.length), title: `${violations.length} recorded issue${violations.length === 1 ? '' : 's'} deserve a review`, body: selected.map(v => v.RuleDescription || v.RuleCode).join('; ') + '. These are exported findings, not newly calculated breaches.', question: `Review the ${violations.length} recorded findings with the adviser, verify current limits and prices, and prepare options for the affected positions.`, evidence: sources, entities, connections });
  }
  const topSector = fundSectors.find(s => !/not classified|unknown/i.test(s.label));
  if (topSector && fundCoverage > 0) {
    const contribution = (h: Holding) => h.weight * funds.get(h.securityId)!.sectors[topSector.label] / funds.get(h.securityId)!.total;
    const allContributors = holdings.filter(h => (funds.get(h.securityId)?.sectors[topSector.label] || 0) > 0).sort((a, b) => contribution(b) - contribution(a));
    const contributing = allContributors.slice(0, 3);
    const otherContribution = allContributors.slice(3).reduce((sum, h) => sum + contribution(h), 0);
    const source: Evidence = { id: 'fund-exposure', title: `${topSector.label} exposure through funds`, type: 'calculation', location: 'reference.json / FundUnbundlingMappings + selected SecurityPositions', fields: fields({ 'Attributed portfolio exposure': percent(topSector.weight, 2), 'Portfolio weight with fund breakdowns': percent(fundCoverage, 2), 'Contributing fund positions': String(allContributors.length), ...Object.fromEntries(contributing.map(h => [h.name, `${percent(contribution(h), 2)} of portfolio value attributed to ${topSector.label}`])), ...(otherContribution > 0 ? { 'Remaining fund contributions': percent(otherContribution, 2) } : {}), Formula: 'Σ (portfolio holding weight × category weight ÷ fund breakdown total)' }), note: 'Only the exposure attributable to covered funds. This is not total sector exposure. Dimensions are aggregated separately and small fund rounding differences are normalized.' };
    evidence.push(source);
    const involved = portfolios.filter(p => contributing.some(h => h.portfolioId === p.PortfolioId));
    findings.push({ id: 'fund-lookthrough', section: 'now', kind: 'insight', tag: 'Inside the funds', metric: percent(topSector.weight), title: `${percent(topSector.weight)} in ${topSector.label.toLowerCase()} through funds`, body: `The supplied fund breakdowns reveal this share of the selected portfolio value. Breakdowns cover ${percent(fundCoverage)} of the portfolio; direct holdings and uncovered exposure are separate.`, question: `Is this ${topSector.label.toLowerCase()} exposure consistent with the customer’s intended allocation?`, evidence: [source, ...contributing.map(h => h.evidence)], entities: [root, ...involved.map(portfolioEntity), ...contributing.map(h => ({ ...holdingEntity(h), value: `${percent(contribution(h), 2)} sector contribution`, evidenceId: source.id })), ...(otherContribution > 0 ? [{ id: 'other-funds', label: 'Other contributing funds', value: `${percent(otherContribution, 2)} sector contribution`, type: 'holding' as const, evidenceId: source.id }] : []), { id: 'sector', label: topSector.label, value: `${percent(topSector.weight)} through funds`, type: 'exposure', evidenceId: source.id }], connections: [...involved.map(p => ({ from: 'customer', to: `p-${p.PortfolioId}`, label: 'owns' })), ...contributing.flatMap(h => [{ from: `p-${h.portfolioId}`, to: h.id, label: 'holds' }, { from: h.id, to: 'sector', label: 'contributes exposure' }]), ...(otherContribution > 0 ? [{ from: 'customer', to: 'other-funds', label: 'also holds in scope' }, { from: 'other-funds', to: 'sector', label: 'contributes exposure' }] : [])] });
  }
  const top = holdings[0];
  if (top && top.weight > 0) {
    const p = portfolios.find(p => p.PortfolioId === top.portfolioId)!;
    findings.push({ id: 'largest-holding', section: 'now', kind: 'context', tag: 'Portfolio composition', metric: percent(top.weight), title: `The largest position represents ${percent(top.weight)}`, body: `${top.name} is the largest security position in the selected scope. Its weight is an observation, not by itself a suitability breach.`, question: `Review ${top.displayName}'s ${percent(top.weight)} weight against the customer's intended allocation; consider diversification options after checking current prices and suitability.`, evidence: [top.evidence], entities: [root, portfolioEntity(p), holdingEntity(top)], connections: [{ from: 'customer', to: `p-${p.PortfolioId}`, label: 'owns' }, { from: `p-${p.PortfolioId}`, to: top.id, label: 'largest security position' }] });
  }
  if (!findings.some(f => f.section === 'now')) {
    const sources = evidence.filter(e => e.id.startsWith('p-'));
    findings.push({ id: 'routine-review', section: 'now', kind: 'context', tag: 'Routine review', title: portfolios.length ? 'A useful starting point for the next review' : 'Customer context is available', body: portfolios.length ? `${scopeAmbiguous ? 'Select a non-overlapping portfolio scope before reviewing combined liquidity.' : money(liquidity, currency) + ' in reported liquidity.'} No linked suitability issues are included in this scope; this alone does not establish suitability.` : 'The export contains no portfolios for this customer. Review the available notes and request the missing portfolio information.', question: 'Have the customer’s objectives, liquidity needs or investment preferences changed?', evidence: sources, entities: [root, ...portfolios.slice(0, 2).map(portfolioEntity)], connections: portfolios.slice(0, 2).map(p => ({ from: 'customer', to: `p-${p.PortfolioId}`, label: 'owns' })) });
  }
  const strategyNames = [...new Set(portfolios.map(p => p.StrategyName).filter(Boolean))];
  const summary = `${portfolios.length} portfolio${portfolios.length === 1 ? '' : 's'}, ${holdings.length} security position${holdings.length === 1 ? '' : 's'} and ${notes.length} customer note${notes.length === 1 ? '' : 's'}. ${violations.length ? `Start with the ${violations.length} recorded review points, then reconnect them to the customer’s priorities.` : 'Start with the customer’s priorities and the composition of their portfolio.'}`;
  return { customer, portfolios, scope, currency, aum, liquidity, scopeAmbiguous, weightsAvailable, holdings, findings, evidence, history, historyCurrency, allocations: [...allocations].map(([label, weight]) => ({ label, weight })).sort((a, b) => b.weight - a.weight), fundCoverage, fundSectors, notes, proposals, violations, unresolved, warnings, summary, strategy: strategyNames.length === 1 ? strategyNames[0] : strategyNames.length > 1 ? 'Multiple strategies' : 'Not recorded' };
}

export function notePriority(text: string): number {
  if (/liquid|tax payment|withdraw|house purchase|cash need|retire|inherit/i.test(text)) return 3;
  if (/avoid|prefer|sustainab|ESG|risk|loss|developed markets|benchmark/i.test(text)) return 2;
  return 1;
}
