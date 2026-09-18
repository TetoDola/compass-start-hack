import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './analysis';
import { parseCustomerUpload } from './import';
import type { Dataset, Row } from './types';

const dataset: Dataset = JSON.parse(readFileSync(new URL('../../public/data/case-data.json', import.meta.url), 'utf8'));
const rawClients: Row[] = JSON.parse(readFileSync(new URL('../../unriskomega-2026/core-case/portfolio-data/clients.json', import.meta.url), 'utf8'));
const rawReference: Row = JSON.parse(readFileSync(new URL('../../unriskomega-2026/core-case/portfolio-data/reference.json', import.meta.url), 'utf8'));

test('every supplied client and individual portfolio produces a finite, source-linked brief', () => {
  assert.equal(dataset.clients.length, 47);
  let scopes = 0;
  for (const customer of dataset.clients) {
    for (const scope of ['all', ...customer.Portfolios.map((p: Row) => String(p.PortfolioId))]) {
      const result = analyze(dataset, customer, scope); scopes++;
      assert.ok(result.findings.some(f => f.section === 'now'));
      const sourceIds = new Set(result.evidence.map(e => e.id));
      for (const finding of result.findings) {
        assert.ok(finding.title && finding.body && finding.question);
        const entityIds = new Set(finding.entities.map(e => e.id));
        assert.equal(entityIds.size, finding.entities.length);
        for (const edge of finding.connections) assert.ok(entityIds.has(edge.from) && entityIds.has(edge.to));
        for (const entity of finding.entities) if (entity.evidenceId) assert.ok(sourceIds.has(entity.evidenceId));
        for (const evidence of finding.evidence) assert.ok(sourceIds.has(evidence.id));
      }
      assert.ok(result.holdings.every(h => Number.isFinite(h.weight)));
      assert.ok(!JSON.stringify(result).includes('NaN'));
    }
  }
  assert.equal(scopes, 104);
});

test('fund look-through matches independently summed raw rows, without adding dimensions', () => {
  const customer = dataset.clients.find(c => c.ClientRef === 'CASE-005')!;
  const raw = rawClients.find(c => c.ClientRef === customer.ClientRef)!;
  const p = raw.Portfolios[0];
  const result = analyze(dataset, customer, String(p.PortfolioId));
  let independentIT = 0;
  for (const position of p.SecurityPositions) {
    const rows = rawReference.FundUnbundlingMappings.filter((r: Row) => r.FundSecurityId === position.SecurityId);
    const sum = rows.reduce((n: number, r: Row) => n + r.Weight, 0);
    if (sum) independentIT += position.PortfolioValuePercentage * rows.filter((r: Row) => r.IndustryName === 'Information Technology').reduce((n: number, r: Row) => n + r.Weight, 0) / sum;
  }
  assert.ok(Math.abs(result.fundSectors.find(s => s.label === 'Information Technology')!.weight - independentIT) < 1e-10);
  assert.ok(Math.abs(result.fundSectors.reduce((n, s) => n + s.weight, 0) - result.fundCoverage) < 1e-10);
});

test('unresolved advisory records cannot become findings for a different portfolio', () => {
  const c = dataset.clients.find(c => c.ClientRef === 'CASE-008')!;
  const result = analyze(dataset, c);
  assert.equal(result.unresolved, 13);
  assert.equal(result.violations.length, 0);
  assert.equal(result.proposals.length, 0);
  assert.ok(!result.findings.some(f => f.id === 'recorded-issues'));
});

test('new same-shape customer IDs work without case-specific behavior', () => {
  const c = structuredClone(rawClients[1]);
  c.ClientId = 999999; c.ClientRef = 'NEW-CUSTOMER';
  const [uploaded] = parseCustomerUpload(JSON.stringify([c]));
  const result = analyze({ ...dataset, clients: [uploaded] }, uploaded);
  assert.ok(result.holdings.length > 0);
  assert.ok(result.evidence.every(e => !e.location.startsWith('clients.json') || e.location.includes('NEW-CUSTOMER')));
});

test('unknown instruments preserve position values and remain unclassified', () => {
  const c = structuredClone(dataset.clients[1]);
  c.Portfolios[0].SecurityPositions[0].SecurityId = 999999;
  const result = analyze(dataset, c);
  const unknown = result.holdings.find(h => h.securityId === 999999)!;
  assert.equal(unknown.known, false);
  assert.equal(unknown.asset, 'Not classified');
  assert.equal(unknown.value, c.Portfolios[0].SecurityPositions[0].TotalAmountInPortfolioCurrency);
  assert.ok(result.warnings.some(w => w.includes('no matching security')));
});

test('sparse clients and null collections retain a useful routine brief', () => {
  const [c] = parseCustomerUpload(JSON.stringify([{ ClientId: 999, ClientRef: 'SPARSE', ReportingCurrency: 'EUR', Portfolios: null, ClientNotes: null, Proposals: null, SuitabilityViolations: null }]));
  const result = analyze(dataset, c);
  assert.equal(result.aum, null);
  assert.equal(result.history.length, 0);
  assert.equal(result.findings[0].id, 'routine-review');
  assert.ok(!result.summary.includes('NaN'));
});

test('histories with different currencies are not added together', () => {
  const c = structuredClone(dataset.clients.find(c => c.Portfolios.length > 1)!);
  c.Portfolios[0].PortfolioCurrency = 'USD';
  const result = analyze(dataset, c);
  assert.equal(result.history.length, 0);
  assert.ok(result.warnings.some(w => w.includes('different currencies')));
  const single = analyze(dataset, c, String(c.Portfolios[0].PortfolioId));
  assert.ok(single.history.length > 0);
  assert.equal(single.historyCurrency, 'USD');
});

test('repeated notes retain the most recent occurrence', () => {
  const c = structuredClone(dataset.clients[1]);
  c.ClientNotes = [{ Note: 'A shared preference', CreatedByDateUTC: '2024-01-01' }, { Note: 'A shared preference', CreatedByDateUTC: '2026-01-01' }];
  const result = analyze(dataset, c);
  assert.equal(result.notes.length, 1);
  assert.equal(result.notes[0].CreatedByDateUTC, '2026-01-01');
});

test('upload rejects malformed structure and financial values instead of coercing them', () => {
  assert.throws(() => parseCustomerUpload('{}'), /array of customers/);
  assert.throws(() => parseCustomerUpload('bad json'), /not valid JSON/);
  assert.throws(() => parseCustomerUpload('[{"ClientId":1,"ClientRef":"X","Portfolios":"wrong"}]'), /array or null/);
  assert.throws(() => parseCustomerUpload('[{"ClientId":1,"ClientRef":"X","AssetsUnderManagementInDefaultCurrency":"100"}]'), /must be a number/);
  assert.throws(() => parseCustomerUpload('[{"ClientId":1,"ClientRef":"X"},{"ClientId":1,"ClientRef":"Y"}]'), /Duplicate/);
});

test('served and imported datasets exclude account identifiers and identity fields', () => {
  const projection = JSON.stringify(parseCustomerUpload(JSON.stringify(rawClients)));
  assert.ok(!projection.includes('"IBAN"'));
  assert.ok(!projection.includes('"FirstName"'));
  assert.ok(!JSON.stringify(dataset).includes('"IBAN"'));
  assert.ok(!JSON.stringify(dataset).includes('"Birthday"'));
});

test('funds are distinguished from company shares and top-ten weights are not renormalized', async () => {
  const { underlyingCompanies } = await import('./instruments');
  const c = dataset.clients.find(c => c.ClientRef === 'CASE-012')!;
  const result = analyze(dataset, c);
  assert.equal(result.holdings.filter(h => h.instrumentType === 'Shares').length, 3);
  const fund = result.holdings.find(h => h.isin === 'IE00B4L5Y983')!;
  assert.equal(fund.instrumentType, 'Investment fund');
  assert.ok(fund.fundHoldings);
  const companies = underlyingCompanies(fund, true);
  assert.equal(companies.length, 10);
  const nvidia = companies.find(h => /nvidia/i.test(h.name))!;
  assert.equal(nvidia.scopeWeight, fund.weight * nvidia.weight);
  assert.equal(nvidia.estimatedValue, fund.value! * nvidia.weight);
  assert.ok(companies.reduce((n, h) => n + h.weight, 0) < 1);
  assert.ok(underlyingCompanies(fund, false).every(h => h.scopeWeight === null));
});

test('an unseen customer can supply a new fund ISIN without pretending it is a known security', () => {
  const [client] = parseCustomerUpload(JSON.stringify([{ ClientId: 999, ClientRef: 'UNSEEN', Portfolios: [{ PortfolioId: 888, SecurityPositions: [{ SecurityId: 999999, SecurityName: 'New fund', Isin: 'IE00B4L5Y983', SecurityTypeName: 'Investment fund', PortfolioValuePercentage: 1, TotalAmountInPortfolioCurrency: 1000 }] }] }]));
  const holding = analyze(dataset, client).holdings[0];
  assert.equal(holding.known, false);
  assert.equal(holding.isin, 'IE00B4L5Y983');
  assert.equal(holding.fundHoldings?.isin, holding.isin);
});
