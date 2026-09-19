import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze, classifyFundSnapshot, fundSnapshotNeedsRefresh } from './analysis';
import { newsTargets } from './briefing';
import { parseDatasetUpload, restoreReferenceClassifications } from './import';
import { portfolioExposures, referenceRegion } from './portfolio';
import type { Dataset } from './types';

const data: Dataset = JSON.parse(readFileSync(new URL('../../public/data/case-data.json', import.meta.url), 'utf8'));
const client = data.clients.find(c => c.ClientRef === 'CASE-012')!;
const apple = data.reference.Securities.find(s => s.Isin === 'US0378331005')!;
const snapshot = data.reference.FundHoldings!.find(f => f.isin === 'IE00B4L5Y983')!;
const fundAnalysis = () => {
  const a = analyze(data, client);
  a.holdings = [a.holdings.find(h => h.isin === snapshot.isin)!];
  return a;
};

test('prepared and uploaded references preserve raw and SAA classifications separately', () => {
  const raw = JSON.parse(readFileSync(new URL('../../unriskomega-2026/core-case/portfolio-data/reference.json', import.meta.url), 'utf8'));
  for (const source of raw.Securities) {
    const prepared = data.reference.Securities.find(s => s.Id === source.Id)!;
    for (const field of ['CountryGroupName', 'SAA_CountryGroupName', 'IndustryName', 'SAA_IndustryName']) assert.equal(prepared[field], source[field] ?? undefined);
  }
  const result = parseDatasetUpload(JSON.stringify({ clients: [client], reference: { Securities: [apple] } }), data.reference);
  assert.equal(result.reference.Securities[0].CountryGroupName, 'Equities North America');
  assert.equal(result.reference.Securities[0].SAA_CountryGroupName, 'North America');
  assert.equal(result.reference.Securities[0].SAA_IndustryName, 'Information Technology');
});

test('direct positions carry source region and distinct policy taxonomy into exposures and targets', () => {
  const a = analyze(data, client);
  a.holdings = [a.holdings.find(h => h.isin === apple.Isin)!];
  const holding = a.holdings[0];
  assert.equal(holding.region, 'Equities North America');
  assert.equal(holding.saaRegion, 'North America');
  assert.equal(holding.saaIndustry, 'Information Technology');
  assert.equal(portfolioExposures(a, 'region')[0].name, 'North America');
  assert.equal(portfolioExposures(a, 'region')[0].weight, holding.weight);
  const company = newsTargets(a).find(t => t.isin === apple.Isin)!;
  assert.equal(company.country, 'United States of America');
  assert.equal(company.region, 'North America');
  assert.equal(company.industry, 'Information Technology');
  assert.ok(company.classificationEvidence?.length);
  holding.country = 'Canada'; holding.region = 'Canada'; holding.saaRegion = 'Canada';
  assert.deepEqual(portfolioExposures(a, 'region'), [], 'An exact country label must not become a second region bucket');
});

test('raw product country groups do not become geographic regions', () => {
  assert.equal(referenceRegion('Bond North America', 'North America'), 'North America');
  assert.equal(referenceRegion('Bonds CHF domestic', 'Switzerland'), 'Switzerland');
  assert.equal(referenceRegion('Equities Europe ex Euroland', 'Rest of Europe'), 'Rest of Europe');
  assert.equal(referenceRegion('Precious metals', 'Others'), undefined);
  assert.equal(referenceRegion('Structured products Commodities', 'Others'), undefined);
  assert.equal(referenceRegion('Bonds CHF international'), undefined);
});

test('constituent classifications join exact ISINs, never names, and preserve reference provenance', () => {
  const supplied = { ...snapshot, holdings: [{ name: 'Different published Apple label', isin: apple.Isin, weight: 0.2 }, { name: apple.Name, isin: 'US0000000001', weight: 0.1 }] };
  const classified = classifyFundSnapshot(supplied, [apple]);
  assert.equal(classified.holdings[0].country, apple.CountryName);
  assert.equal(classified.holdings[0].region, apple.CountryGroupName);
  assert.equal(classified.holdings[0].industry, apple.IndustryName);
  assert.ok(classified.holdings[0].classificationEvidence?.every(e => e.location.includes(`Id=${apple.Id}`)));
  assert.equal(classified.holdings[1].country, undefined);
  assert.equal(classified.holdings[1].industry, undefined);
  assert.ok(!('country' in supplied.holdings[0]), 'Enrichment must not mutate source snapshots');
});

test('conflicting exact-ISIN master metadata is withheld per field', () => {
  const supplied = { ...snapshot, holdings: [{ name: 'Apple', isin: apple.Isin, weight: 0.2 }] };
  const result = classifyFundSnapshot(supplied, [apple, { ...apple, Id: 999999, CountryName: 'Canada' }]);
  assert.equal(result.holdings[0].country, undefined);
  assert.equal(result.holdings[0].industry, 'Information Technology');
  assert.ok(!result.holdings[0].classificationEvidence?.some(e => e.fields.some(f => f.label === 'CountryName')));
});

test('partial constituent countries supplement broad groups without duplicating complete country allocations', () => {
  const a = fundAnalysis(), fund = a.holdings[0];
  fund.weight = 0.5;
  fund.fundBreakdown = { id: fund.securityId, total: 100, sectors: { Industrials: 100 }, regions: { 'Equities Switzerland': 20, 'Equities North America': 80 } };
  fund.fundHoldings = { ...snapshot, holdings: [{ name: 'US constituent', country: 'United States of America', weight: 0.3 }, { name: 'Swiss constituent', country: 'Switzerland', weight: 0.1 }] };
  const countries = portfolioExposures(a, 'country');
  assert.equal(countries.find(c => c.name === 'Switzerland')!.weight, 0.1);
  assert.equal(countries.find(c => c.name === 'United States of America')!.weight, 0.15);
  assert.equal(countries.reduce((sum, c) => sum + c.weight, 0), 0.25);
  assert.deepEqual(portfolioExposures(a, 'region').map(e => [e.name, e.weight]), [['North America', 0.4]]);
  assert.ok(countries.find(c => c.name === 'United States of America')!.evidence.some(e => e.date === snapshot.asOf));
});

test('conflicting fund classification totals are not rescaled into invented country weights', () => {
  const a = fundAnalysis(), fund = a.holdings[0];
  fund.fundBreakdown = { id: fund.securityId, total: 100, sectors: { Industrials: 100 }, regions: { 'Equities Switzerland': 80, 'Equities North America': 20 } };
  fund.fundHoldings = { ...snapshot, holdings: [{ name: 'US constituent', country: 'United States of America', weight: 0.5 }] };
  assert.deepEqual(portfolioExposures(a, 'country').map(c => c.name), ['Switzerland']);
});

test('without category mappings, verified constituent metadata provides partial country, region and industry coverage', () => {
  const a = fundAnalysis(), fund = a.holdings[0];
  fund.weight = 0.5;
  fund.fundBreakdown = undefined;
  fund.fundHoldings = classifyFundSnapshot({ ...snapshot, holdings: [{ name: 'Apple', isin: apple.Isin, weight: 0.2 }, { name: 'Unclassified remainder', weight: 0.4 }] }, [apple]);
  for (const kind of ['country', 'region', 'industry'] as const) {
    const rows = portfolioExposures(a, kind);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].weight, 0.1);
    assert.ok(rows[0].evidence[0].fields.some(f => f.label === 'Classification source' && f.value.includes('reference.json')));
  }
});

test('freshness checks request refresh for old observations, old retrievals and invalid dates', () => {
  const now = Date.parse('2026-09-19T12:00:00Z');
  const fresh = { ...snapshot, asOf: '2026-09-01', retrievedAt: '2026-09-19T10:00:00Z' };
  assert.equal(fundSnapshotNeedsRefresh(fresh, now), false);
  assert.equal(fundSnapshotNeedsRefresh({ ...fresh, asOf: '2026-07-31' }, now), true);
  assert.equal(fundSnapshotNeedsRefresh({ ...fresh, retrievedAt: '2026-09-17' }, now), true);
  assert.equal(fundSnapshotNeedsRefresh({ ...fresh, asOf: '2026-09-20' }, now), true);
  assert.equal(fundSnapshotNeedsRefresh({ ...fresh, asOf: 'missing' }, now), true);
});

test('older persisted workspaces recover classifications only for matching source identities', () => {
  const saved = structuredClone(data);
  const security = saved.reference.Securities.find(s => s.Id === apple.Id)!;
  delete security.CountryGroupName;
  delete security.SAA_CountryGroupName;
  security.SAA_IndustryName = 'User-supplied industry';
  saved.reference.Securities.push({ ...apple, Id: 999999, CountryGroupName: undefined, SAA_CountryGroupName: undefined });
  saved.reference.Securities.push({ ...apple, Id: 888888, ExternalSource: 'statement-hash', CountryGroupName: undefined, SAA_CountryGroupName: undefined });
  const restored = restoreReferenceClassifications(saved, data);
  assert.equal(restored.reference.Securities.find(s => s.Id === apple.Id)!.CountryGroupName, 'Equities North America');
  assert.equal(restored.reference.Securities.find(s => s.Id === apple.Id)!.SAA_IndustryName, 'User-supplied industry');
  assert.equal(restored.reference.Securities.find(s => s.Id === 999999)!.CountryGroupName, undefined);
  assert.equal(restored.reference.Securities.find(s => s.Id === 888888)!.CountryGroupName, 'Equities North America');
  assert.equal(security.CountryGroupName, undefined, 'Migration must not mutate saved source data');
  const collision = structuredClone(saved);
  collision.reference.Securities.find(s => s.Id === apple.Id)!.Isin = 'US0000000001';
  assert.equal(restoreReferenceClassifications(collision, data).reference.Securities.find(s => s.Id === apple.Id)!.CountryGroupName, undefined);
});

test('persisted external positions never gain classifications from conflicting or different instrument sources', () => {
  const saved = structuredClone(data);
  saved.reference.Securities = [{ Id: 888888, Isin: apple.Isin, SecurityTypeName: 'Shares', ExternalSource: 'statement-hash' }];
  const conflicting = structuredClone(data);
  conflicting.reference.Securities.push({ ...apple, Id: 999999, CountryGroupName: 'Equities Pacific' });
  assert.equal(restoreReferenceClassifications(saved, conflicting).reference.Securities[0].CountryGroupName, undefined);
  saved.reference.Securities[0].SecurityTypeName = 'Investment fund';
  assert.equal(restoreReferenceClassifications(saved, data).reference.Securities[0].CountryGroupName, undefined);
});
