import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseCustodyPages, pdfRows, type PdfPage, type PdfRow } from '../src/lib/pdfImport';

type Schema = Record<string, unknown>;
const string: Schema = { type: 'string' }, number: Schema = { type: 'number' }, integer: Schema = { type: 'integer' };
const array = (items: Schema): Schema => ({ type: 'array', items });
const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({ type: 'object', additionalProperties: false, properties, required });
const position = object({ name: string, currency: string, quantity: number, value: number, weight: number, page: integer, assetClass: string, isin: string, price: number, cost: number, priceDate: string }, ['name', 'currency', 'quantity', 'value', 'weight', 'page', 'assetClass', 'priceDate']);

/** Shape only: no source-specific numbers, names, array lengths or expected values. */
export const pdfOutputSchema = object({
  fileName: string, pages: integer, owner: string, bank: string, strategy: string, currency: string, asOf: string, total: number,
  positions: array(position), cash: array(position),
  performance: object({ start: string, end: string, twr: number, page: integer, opening: number, closing: number, netFlows: number, profit: number }),
  contributions: array(object({ assetClass: string, profit: number, mwr: number, profitShare: number, page: integer })),
  allocations: array(object({ dimension: string, scope: string, label: string, weight: number, page: integer })),
  currencyMatrix: array(object({ page: integer, currency: string, label: string, cells: array(object({ assetClass: string, value: number, weight: number })) })),
  unhedgedFx: object({ page: integer, currency: string, value: number, weight: number }),
  sustainability: array(object({ page: integer, dimension: string, scope: string, label: string, weight: number })),
  transactions: array(object({ page: integer, currency: string, transaction: string, name: string, bookingDate: string, valueDate: string, quantity: number, isin: string, price: number, amount: number, expenseIncome: number }, ['page', 'currency', 'transaction', 'name', 'bookingDate', 'valueDate', 'amount', 'expenseIncome'])),
  transactionsCoverage: string,
  performanceHistory: array(object({ page: integer, period: string, currency: string, opening: number, netFlows: number, closing: number, profit: number, twr: number })),
});

export const pdfExtractionInstructions = `Extract the report into the supplied schema using only printed source facts. Every input row contains full text and x-coordinate-labelled cells; use columns to separate parallel tables and chart legends. Preserve reading order within arrays. Use ISO dates and fractional weights/returns (5.20% becomes 0.052). Retain printed signs, rounding and original ISIN strings even when a checksum is invalid. Do not repair identifiers or reconcile printed values by changing them. Omit optional fields when blank, rather than guessing zero. Do not return depot numbers or account identifiers.
positions contains only the security rows identified by ISIN; cash contains only the cash account rows, without their account identifiers. Do not replace or combine the two arrays. Normalize security assetClass labels to Cash, Bonds, Equities, Alternatives. The cost field is the printed Einstand unit-price or percentage quote in the security currency, not quantity multiplied by that quote and not an aggregate cost basis. The price field is the printed Marktkurs quote. Values and position weights use the report's reference currency/whole portfolio; position currency remains the quoted instrument currency. performance is the cover reporting interval with its annual table figures and the performance-table page. Take performance.netFlows from the annual history table Kapitalfluss column for the reporting year, preserving its sign; do not take the subtraction adjustment from the profit-bridge line labelled minus Netto Kapitalfluss. contributions are Cash, Bonds, Equities, Alternatives in source column order. allocations are the page-five charts. dimension and scope are separate fields: use dimension=asset with scope=portfolio, dimension=currency with scope=portfolio, dimension=region with scope=equities, and dimension=industry with scope=equities. The only permitted allocation dimension strings are asset, currency, region, industry; the only permitted allocation scope strings are portfolio, equities. Never concatenate dimension and scope or rename asset to asset-class/assetClass. Preserve each chart's legend order and original German labels; normalized security assetClass names do not replace chart labels. Reported TWR differs from MWR, profit and value movement.
currencyMatrix preserves printed currency rows then Total; use currency=Total for its total row, original German label, and cells in Cash, Bonds, Equities, Alternatives, Total column order. Include only printed cells; blank cells are not invented zeros. unhedgedFx is the separately printed unhedged foreign-currency security amount/share. sustainability contains the portfolio sustainability chart then the equities-and-bonds MSCI ESG chart, using dimension=sustainability/scope=portfolio and dimension=msci-esg/scope=equities-and-bonds. Keep original legend labels. transactions contains every printed selected transaction in row order, original German transaction/name text, two dates, signed amount and expenseIncome; preserve quantity/ISIN/price only when printed. Set transactionsCoverage=selected, because the source says this is not a complete transaction ledger. performanceHistory includes each printed historical annual row (including the initial partial-year period label), not the Total line or chart axes. Exclude account/hash/warnings/reconciliation and other derived application fields.`;

const amount = (text: string) => Number(text.replace(/['’\s%]/g, ''));
const numeric = /^[+-]?[\d'’]+(?:\.\d+)?$/;
const iso = (text: string) => { const [day, month, year] = text.split('.'); return `${year.length === 2 ? '20' + year : year}-${month}-${day}`; };
const textBetween = (row: PdfRow, left: number, right = Infinity) => row.items.filter(i => i.x >= left && i.x < right).map(i => i.text).join(' ').trim();
const percent = (text: string) => amount(text) / 100;

// Redact isolated original text items: a joined ISIN followed by a date can resemble a long IBAN.
export function redactPdfInput(text: string): string {
  return text.replace(/Depot-Nr\.?\s*[\d.]+/g, 'Depot-Nr. [account redacted]')
    .replace(/\bCH\d{2}(?: ?[A-Z0-9]){17}\b/g, '[account redacted]')
    .replace(/\b(?:DE|GB)\d{2}(?: ?[A-Z0-9]){18}\b/g, '[account redacted]');
}

function supplements(pages: PdfPage[]) {
  const currencyMatrix: { page: number; currency: string; label: string; cells: { assetClass: string; value: number; weight: number }[] }[] = [];
  let unhedgedFx: { page: number; currency: string; value: number; weight: number } | undefined;
  const sustainability: { page: number; dimension: string; scope: string; label: string; weight: number }[] = [];
  const transactions: Record<string, string | number>[] = [], performanceHistory: Record<string, string | number>[] = [];
  for (const page of pages) {
    const rows = pdfRows(page.items), text = rows.map(r => r.text).join('\n');
    if (/Vermögensstruktur nach Anlagekategoriengruppen/.test(text)) {
      const labels = ['Geldmarkt', 'Obligationen', 'Aktien', 'Anlagen', 'Total'];
      const header = rows.find(r => labels.every(label => r.items.some(i => i.text === label)));
      if (!header) throw new Error(`Missing currency-matrix columns on page ${page.page}`);
      const anchors = labels.map(label => header.items.find(i => i.text === label)!.x);
      const bounds = [anchors[0] - (anchors[1] - anchors[0]) / 2, ...anchors.slice(1).map((x, i) => (x + anchors[i]) / 2), Infinity];
      for (const row of rows.filter(r => r.y < header.y)) {
        const label = textBetween(row, 0, bounds[0]);
        const match = label.match(/\(([A-Z]{3})\)$/);
        if (!match && label !== 'Total') continue;
        const cells = [];
        for (const [i, assetClass] of ['Cash', 'Bonds', 'Equities', 'Alternatives', 'Total'].entries()) {
          const cell = textBetween(row, bounds[i], bounds[i + 1]);
          if (!cell) continue;
          const values = cell.match(/^([\d'’]+(?:\.\d+)?) ([\d.]+) %$/);
          if (!values) throw new Error(`Unrecognized matrix cell: ${cell}`);
          cells.push({ assetClass, value: amount(values[1]), weight: percent(values[2]) });
        }
        currencyMatrix.push({ page: page.page, currency: match?.[1] || 'Total', label, cells });
      }
      const fx = text.match(/ohne Absicherung: ([A-Z]{3}) ([\d'’]+) \(([\d.]+) %/);
      if (!fx) throw new Error('Unhedged FX disclosure missing');
      unhedgedFx = { page: page.page, currency: fx[1], value: amount(fx[2]), weight: percent(fx[3]) };
    }
    if (/Grafische Portfoliostruktur/.test(text)) {
      const headings = ['Nachhaltigkeitseinschätzungen Portfolio', 'Aufteilung Aktien/Obligationen nach MSCI ESG Ratings'];
      for (const [index, heading] of headings.entries()) {
        const header = rows.find(r => r.items.some(i => i.text === heading));
        if (!header) throw new Error(`Missing sustainability heading: ${heading}`);
        const left = header.items.find(i => i.text === heading)!.x;
        const right = header.items.filter(i => i.x > left + 20).sort((a, b) => a.x - b.x)[0]?.x || Infinity;
        for (const row of rows.filter(r => r.y < header.y)) {
          const content = textBetween(row, left - 2, right - 5);
          const values = content.match(/^(.+?) ([\d.]+) %$/);
          if (values) sustainability.push({ page: page.page, dimension: index ? 'msci-esg' : 'sustainability', scope: index ? 'equities-and-bonds' : 'portfolio', label: values[1], weight: percent(values[2]) });
        }
      }
    }
    if (/Transaktionen vom/.test(text)) {
      if (!/nur ausgewählte Transaktionen/.test(text)) throw new Error('Transaction coverage disclaimer missing');
      for (const row of rows) {
        const currency = textBetween(row, 45, 85);
        if (!/^[A-Z]{3}$/.test(currency)) continue;
        const dates = textBetween(row, 550, 635).match(/(\d{2}\.\d{2}\.\d{4}) \/ (\d{2}\.\d{2}\.\d{4})/);
        if (!dates) throw new Error(`Unrecognized transaction dates on page ${page.page}`);
        let transaction = textBetween(row, 130, 222), name = textBetween(row, 222, 426);
        // In fee rows the PDF stores both neighbouring text columns as one text item.
        if (!name) { const fee = transaction.match(/^(Depotgebühren Q1-Q4 \d{4}) (.+)$/); if (!fee) throw new Error(`Unrecognized combined transaction label: ${transaction}`); [, transaction, name] = fee; }
        const quantity = textBetween(row, 85, 130), price = textBetween(row, 635, 680);
        const isin = textBetween(row, 426, 550).match(/\b[A-Z]{2}[A-Z0-9]{9}\d\b/)?.[0];
        const cash = textBetween(row, 680, 759), expense = textBetween(row, 759);
        if (!numeric.test(cash) || !numeric.test(expense)) throw new Error('Unrecognized transaction amounts');
        transactions.push({ page: page.page, currency, transaction, name, bookingDate: iso(dates[1]), valueDate: iso(dates[2]), ...(quantity ? { quantity: amount(quantity) } : {}), ...(isin ? { isin } : {}), ...(price ? { price: amount(price) } : {}), amount: amount(cash), expenseIncome: amount(expense) });
      }
    }
    if (/Performance Übersicht/.test(text)) {
      const table = rows.find(r => r.items.some(i => i.text === 'Jahr') && r.items.some(i => i.text === 'Anfangswert'));
      if (!table) throw new Error('Historical performance table missing');
      for (const row of rows.filter(r => r.y < table.y)) {
        const content = textBetween(row, 45, 450);
        const entry = content.match(/^(ab \d{2}\.\d{2}\.\d{4}|\d{4}) ([A-Z]{3}) ([+\-\d'’.]+) ([+\-\d'’.]+) ([+\-\d'’.]+) ([+\-\d'’.]+) ([+\-\d.]+) %$/);
        if (entry) performanceHistory.push({ page: page.page, period: entry[1], currency: entry[2], opening: amount(entry[3]), netFlows: amount(entry[4]), closing: amount(entry[5]), profit: amount(entry[6]), twr: percent(entry[7]) });
      }
    }
  }
  if (!currencyMatrix.length || !unhedgedFx || !sustainability.length || !transactions.length || !performanceHistory.length) throw new Error('Supplemental PDF baseline is incomplete');
  return { currencyMatrix, unhedgedFx, sustainability, transactions, transactionsCoverage: 'selected', performanceHistory };
}

export async function loadPdfCorpus() {
  const directory = path.resolve('unriskomega-2026/side-challenge');
  const files = (await readdir(directory)).filter(file => file.endsWith('.pdf')).sort();
  const jobs = [];
  for (const [index, file] of files.entries()) {
    const source = path.join('unriskomega-2026/side-challenge', file), bytes = await readFile(path.join(directory, file));
    const sourceHash = createHash('sha256').update(bytes).digest('hex');
    const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    try {
      const document = await task.promise, pages: PdfPage[] = [];
      for (let page = 1; page <= document.numPages; page++) {
        const content = await (await document.getPage(page)).getTextContent();
        pages.push({ page, items: content.items.filter((item): item is typeof item & { str: string; transform: number[] } => 'str' in item) });
      }
      const report = parseCustodyPages(pages, file, sourceHash);
      const { account: _account, hash: _hash, warnings: _warnings, reconciliation: _reconciliation, elapsedMs: _elapsed, ...core } = report;
      const expected = { ...core, ...supplements(pages) };
      const input = { pages: pages.map(page => ({ page: page.page, rows: pdfRows(page.items).map(row => {
        const cells = row.items.map(cell => ({ x: Math.round(cell.x), text: redactPdfInput(cell.text) }));
        return `${cells.map(cell => cell.text).join(' ')} || COLUMNS: ${cells.map(cell => `[x=${cell.x}] ${cell.text}`).join(' | ')}`;
      }) })) };
      jobs.push({ id: `pdf-${String(index + 1).padStart(2, '0')}`, source, sourceHash, instructions: pdfExtractionInstructions, input, expected });
    } finally { await task.destroy(); }
  }
  return { jobs, scope: { documents: jobs.length, pages: jobs.reduce((sum, job) => sum + job.expected.pages, 0), securityPositions: jobs.reduce((sum, job) => sum + job.expected.positions.length, 0), cashPositions: jobs.reduce((sum, job) => sum + job.expected.cash.length, 0), transactions: jobs.reduce((sum, job) => sum + job.expected.transactions.length, 0), matrixCells: jobs.reduce((sum, job) => sum + job.expected.currencyMatrix.reduce((n, row) => n + row.cells.length, 0), 0), sustainabilityRows: jobs.reduce((sum, job) => sum + job.expected.sustainability.length, 0), historicalPerformanceRows: jobs.reduce((sum, job) => sum + job.expected.performanceHistory.length, 0), baseline: 'Existing deterministic custody parser for core fields; independent coordinate-based extraction for currency matrix, unhedged FX, sustainability, selected transactions and annual performance history. All original PDF pages are supplied to the model; vector chart shapes are not included.' } };
}
