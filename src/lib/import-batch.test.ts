import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeJsonUploads } from './import';
import type { Dataset } from './types';

const current: Dataset = {
  version: 'case',
  clients: [{ ClientId: 1, ClientRef: 'CASE-001', FirstName: 'Existing', Portfolios: [] }],
  reference: { Securities: [], RiskProfiles: [], StrategicAssetAllocations: [], FundBreakdowns: [] },
};
const file = (name: string, data: unknown) => ({ name, text: JSON.stringify(data) });

test('multiple client JSON files add any number of named clients in one batch', () => {
  const many = Array.from({ length: 1201 }, (_, index) => ({ ClientId: index + 2, ClientRef: `NEW-${index + 2}`, FirstName: `Client ${index + 2}`, Portfolios: [] }));
  const result = mergeJsonUploads(current, [file('first.json', many), file('second.json', [{ ClientId: 1203, ClientRef: 'NEW-1203', Company: 'Acme AG', Portfolios: [] }])]);
  assert.equal(result.added, 1202);
  assert.equal(result.dataset.clients.length, 1203);
  assert.equal(result.dataset.clients[0].FirstName, 'Existing');
  assert.equal(result.dataset.clients.at(-1)?.Company, 'Acme AG');
  assert.equal(result.firstClientId, 2);
  assert.equal(current.clients.length, 1);
});

test('repeat uploads skip identical clients and reject conflicting IDs or references', () => {
  const incoming = [{ ClientId: 2, ClientRef: 'NEW-2', FirstName: 'Ada', Portfolios: [] }];
  const first = mergeJsonUploads(current, [file('clients.json', incoming)]);
  const again = mergeJsonUploads(first.dataset, [file('clients.json', incoming)]);
  assert.equal(again.added, 0);
  assert.equal(again.skipped, 1);
  assert.equal(again.firstClientId, null);
  const mixed = mergeJsonUploads(first.dataset, [file('mixed.json', [...incoming, { ClientId: 3, ClientRef: 'NEW-3', FirstName: 'Grace', Portfolios: [] }])]);
  assert.equal(mixed.firstClientId, 3);
  assert.throws(() => mergeJsonUploads(current, [file('good.json', incoming), file('bad.json', [{ ClientId: 2, ClientRef: 'NEW-2', FirstName: 'Different', Portfolios: [] }])]), /bad\.json: ClientId 2/);
  assert.throws(() => mergeJsonUploads(first.dataset, [file('bad.json', [{ ClientId: 3, ClientRef: 'NEW-2', Portfolios: [] }])]), /ClientRef NEW-2/);
  assert.equal(current.clients.length, 1);
});

test('separate reference JSON is merged with client arrays regardless of file order', () => {
  const clients = file('clients.json', [{ ClientId: 2, ClientRef: 'NEW-2', FirstName: 'Ada', Portfolios: [{ PortfolioId: 20, SecurityPositions: [{ SecurityId: 90, SecurityName: 'Example' }] }] }]);
  const reference = file('reference.json', { Securities: [{ Id: 90, Name: 'Example', SecurityTypeName: 'Shares' }] });
  for (const inputs of [[reference, clients], [clients, reference]]) {
    const result = mergeJsonUploads(current, inputs);
    assert.equal(result.added, 1);
    assert.equal(result.dataset.reference.Securities[0].Id, 90);
    assert.equal(result.dataset.clients[1].FirstName, 'Ada');
  }
  assert.throws(() => mergeJsonUploads(current, [reference]), /containing clients/);
});

test('the supplied clients and separate reference files can be reimported without duplicating cases', () => {
  const prepared: Dataset = JSON.parse(readFileSync(new URL('../../public/data/case-data.json', import.meta.url), 'utf8'));
  const clients = readFileSync(new URL('../../unriskomega-2026/core-case/portfolio-data/clients.json', import.meta.url), 'utf8');
  const reference = readFileSync(new URL('../../unriskomega-2026/core-case/portfolio-data/reference.json', import.meta.url), 'utf8');
  const result = mergeJsonUploads(prepared, [{ name: 'clients.json', text: clients }, { name: 'reference.json', text: reference }]);
  assert.equal(result.added, 0);
  assert.equal(result.skipped, 47);
  assert.equal(result.dataset.clients.length, 47);
  assert.equal(result.dataset.reference.Securities.length, prepared.reference.Securities.length);
});
