type Row = Record<string, any>;
type Counter = { checks: number; passed: number };
type Category = 'monetary' | 'ratios' | 'quantities' | 'labelsAndIdentity' | 'provenance';
type Example = { job: string; section: string; identity?: string; field?: string; kind: string; expected?: unknown; actual?: unknown };
type Coverage = { expected: number; actual: number; matched: number; missing: number; extra: number; ambiguousExpected: number; ambiguousActual: number; duplicatedKeys: number };
const counter = (): Counter => ({ checks: 0, passed: 0 });
const coverage = (): Coverage => ({ expected: 0, actual: 0, matched: 0, missing: 0, extra: 0, ambiguousExpected: 0, ambiguousActual: 0, duplicatedKeys: 0 });
const categories = (): Record<Category, Counter> => ({ monetary: counter(), ratios: counter(), quantities: counter(), labelsAndIdentity: counter(), provenance: counter() });
const normalize = (v: unknown) => typeof v === 'string' ? v.normalize('NFC').trim().replace(/\s+/g, ' ') : v;
const equal = (a: unknown, b: unknown) => typeof a === 'number' && typeof b === 'number' ? Number.isFinite(b) && Math.abs(a - b) <= 0.000001 : normalize(a) === normalize(b);
const key = (row: Row, fields: string[]) => JSON.stringify(fields.map(f => normalize(row?.[f] ?? null)));
const core = new Set(['cover', 'positions', 'cash', 'performance']);
const monetary = new Set(['total', 'value', 'opening', 'closing', 'netFlows', 'profit', 'amount', 'expenseIncome', 'price', 'cost']);
const ratios = new Set(['weight', 'twr', 'mwr', 'profitShare']);
const category = (field: string): Category => monetary.has(field) ? 'monetary' : ratios.has(field) ? 'ratios' : field === 'quantity' ? 'quantities' : ['page', 'pages'].includes(field) ? 'provenance' : 'labelsAndIdentity';
const countFacts = (v: any): number => v == null ? 0 : Array.isArray(v) ? v.reduce((n, x) => n + countFacts(x), 0) : typeof v === 'object' ? Object.values(v).reduce<number>((n, x) => n + countFacts(x), 0) : 1;

/** Read-only, uniquely keyed alignment. Never silently matches duplicate or fuzzy identities. */
export function assessPdfJobs(jobs: Row[]) {
  const perDocument: Row[] = [], examples: Example[] = [], orderingChanges: Row[] = [], identityChangeCandidates: Row[] = [];
  for (const job of jobs.filter(j => j.kind === 'pdf' || /^pdf-\d+$/.test(j.id || ''))) {
    const expected = job.expected || {}, actual = job.actual;
    const sections: Record<string, { facts: Counter; categories: Record<Category, Counter>; rows: Coverage; absentSourceFacts: number; unsupportedValues: number; schemaIssues: number }> = {};
    const details: Example[] = [];
    const sectionStats = (name: string) => sections[name] ||= { facts: counter(), categories: categories(), rows: coverage(), absentSourceFacts: 0, unsupportedValues: 0, schemaIssues: 0 };
    const example = (value: Omit<Example, 'job'>) => { const e = { job: job.id, ...value }; details.push(e); if (examples.length < 100) examples.push(e); };
    function compareObject(section: string, before: Row, after: Row | undefined, identity?: string, omit: string[] = []) {
      const stat = sectionStats(section);
      for (const [field, value] of Object.entries(before)) {
        if (omit.includes(field)) continue;
        if (value && typeof value === 'object') throw new Error(`Unregistered nested field: ${section}.${field}`);
        const received = after?.[field];
        if (value == null) {
          if (received != null) { stat.unsupportedValues++; example({ section, identity, field, kind: 'unprinted-value-invented', expected: null, actual: received }); }
          continue;
        }
        const bucket = stat.categories[category(field)];
        stat.facts.checks++; bucket.checks++;
        if (equal(value, received)) { stat.facts.passed++; bucket.passed++; }
        else example({ section, identity, field, kind: received === undefined ? 'missing-field' : `${category(field)}-mismatch`, expected: value, actual: received });
      }
      for (const field of Object.keys(after || {})) if (!(field in before) && !omit.includes(field) && after![field] != null) {
        stat.schemaIssues++; example({ section, identity, field, kind: 'extra-field', actual: after![field] });
      }
    }
    function compareRows(section: string, before: Row[], after: unknown, keys: string[], callback?: (e: Row, a: Row, id: string) => void) {
      const stat = sectionStats(section), list: Row[] = Array.isArray(after) ? after : [];
      stat.rows.expected += before.length; stat.rows.actual += list.length;
      if (!Array.isArray(after)) { stat.schemaIssues++; example({ section, kind: 'missing-or-invalid-array' }); }
      const group = (rows: Row[]) => { const groups = new Map<string, Row[]>(); for (const row of rows) { const id = key(row, keys); groups.set(id, [...(groups.get(id) || []), row]); } return groups; };
      const want = group(before), got = group(list), matched = new Set<string>();
      for (const id of new Set([...want.keys(), ...got.keys()])) {
        const source = want.get(id) || [], result = got.get(id) || [];
        if (source.length > 1 || result.length > 1) {
          stat.rows.duplicatedKeys++; stat.rows.ambiguousExpected += source.length; stat.rows.ambiguousActual += result.length;
          stat.absentSourceFacts += source.reduce((n, x) => n + countFacts(x), 0);
          example({ section, identity: id, kind: 'duplicate-identity-not-matched', expected: source.length, actual: result.length });
        } else if (!result.length) {
          stat.rows.missing += source.length; stat.absentSourceFacts += source.reduce((n, x) => n + countFacts(x), 0);
          example({ section, identity: id, kind: 'missing-row' });
        } else if (!source.length) {
          stat.rows.extra += result.length;
          example({ section, identity: id, kind: 'extra-row', actual: result[0] });
        } else {
          matched.add(id); stat.rows.matched++;
          if (callback) callback(source[0], result[0], id); else compareObject(section, source[0], result[0], id);
        }
      }
      const sourceOrder = before.map(row => key(row, keys)).filter(id => matched.has(id));
      const outputOrder = list.map(row => key(row, keys)).filter(id => matched.has(id));
      if (sourceOrder.some((id, i) => outputOrder[i] !== id)) orderingChanges.push({ job: job.id, section, matchedRows: matched.size, sourceOrder, outputOrder });
    }
    // Diagnostic only: these never change exact-identity scores. A unique unchanged
    // numeric/source anchor can show a label/schema failure rather than absent numbers.
    function diagnoseIdentityChanges(section: string, identities: string[], anchors: string[][]) {
      const before: Row[] = expected[section] || [], after: Row[] = Array.isArray(actual?.[section]) ? actual[section] : [];
      const unmatched = (rows: Row[], other: Row[]) => rows.filter(row => !other.some(x => key(x, identities) === key(row, identities)));
      const wanted = unmatched(before, after), got = unmatched(after, before), used = new Set<Row>();
      for (const source of wanted) for (const fields of anchors) {
        const sameAnchor = (row: Row) => fields.every(field => equal(source[field], row[field]));
        if (wanted.filter(sameAnchor).length !== 1) continue;
        const candidates = got.filter(sameAnchor);
        if (candidates.length !== 1 || used.has(candidates[0])) continue;
        const result = candidates[0];
        const numericFields = Object.keys(source).filter(f => typeof source[f] === 'number');
        if (!numericFields.every(f => equal(source[f], result[f]))) continue;
        used.add(result);
        identityChangeCandidates.push({ job: job.id, section, sourceIdentity: key(source, identities), outputIdentity: key(result, identities), unchangedNumericFields: numericFields, changedFields: Object.keys(source).filter(f => !equal(source[f], result[f])) });
        break;
      }
    }
    diagnoseIdentityChanges('allocations', ['dimension', 'scope', 'label'], [['scope', 'label', 'page', 'weight'], ['dimension', 'scope', 'page', 'weight']]);
    diagnoseIdentityChanges('transactions', ['currency', 'name', 'bookingDate', 'valueDate'], [['currency', 'bookingDate', 'valueDate', 'amount', 'expenseIncome', 'page']]);
    const coverFields = ['fileName', 'pages', 'owner', 'bank', 'strategy', 'currency', 'asOf', 'total', 'transactionsCoverage'];
    compareObject('cover', Object.fromEntries(coverFields.filter(f => expected[f] !== undefined).map(f => [f, expected[f]])), actual && Object.fromEntries(coverFields.filter(f => actual[f] !== undefined).map(f => [f, actual[f]])));
    for (const section of ['performance', 'unhedgedFx']) if (expected[section]) compareObject(section, expected[section], actual?.[section]);
    const arrays: [string, string[]][] = [
      ['positions', ['isin', 'page']], ['cash', ['name', 'currency']], ['contributions', ['assetClass']],
      ['allocations', ['dimension', 'scope', 'label']], ['sustainability', ['dimension', 'scope', 'label']],
      ['transactions', ['currency', 'name', 'bookingDate', 'valueDate']], ['performanceHistory', ['period', 'currency']],
    ];
    for (const [section, keys] of arrays) compareRows(section, expected[section] || [], actual?.[section], keys);
    compareRows('currencyMatrix', expected.currencyMatrix || [], actual?.currencyMatrix, ['currency'], (e, a, id) => {
      compareObject('currencyMatrix', e, a, id, ['cells']);
      compareRows(`currencyMatrix.cells:${e.currency}`, e.cells || [], a.cells, ['assetClass']);
    });
    const summarize = (entries: typeof sections) => {
      const result = { sourceFacts: counter(), matchedFacts: counter(), categories: categories(), rows: coverage(), missingOrAmbiguousFacts: 0, unsupportedValues: 0, schemaIssues: 0 };
      for (const stat of Object.values(entries)) {
        result.sourceFacts.checks += stat.facts.checks + stat.absentSourceFacts; result.sourceFacts.passed += stat.facts.passed;
        result.matchedFacts.checks += stat.facts.checks; result.matchedFacts.passed += stat.facts.passed;
        result.missingOrAmbiguousFacts += stat.absentSourceFacts; result.unsupportedValues += stat.unsupportedValues; result.schemaIssues += stat.schemaIssues;
        for (const k of Object.keys(result.rows) as (keyof Coverage)[]) result.rows[k] += stat.rows[k];
        for (const k of Object.keys(result.categories) as Category[]) { result.categories[k].checks += stat.categories[k].checks; result.categories[k].passed += stat.categories[k].passed; }
      }
      return result;
    };
    perDocument.push({ id: job.id, source: job.source, hasModelOutput: !!actual, strictOrderSensitive: job.metrics, factualMetrics: summarize(sections), coreMetrics: summarize(Object.fromEntries(Object.entries(sections).filter(([name]) => core.has(name)))), sections, examples: details });
  }
  const addMetrics = (field: string) => {
    const result = { sourceFacts: counter(), matchedFacts: counter(), categories: categories(), rows: coverage(), missingOrAmbiguousFacts: 0, unsupportedValues: 0, schemaIssues: 0 };
    for (const document of perDocument) {
      const current = document[field];
      for (const k of ['sourceFacts', 'matchedFacts'] as const) { result[k].checks += current[k].checks; result[k].passed += current[k].passed; }
      for (const k of Object.keys(result.rows) as (keyof Coverage)[]) result.rows[k] += current.rows[k];
      for (const k of Object.keys(result.categories) as Category[]) { result.categories[k].checks += current.categories[k].checks; result.categories[k].passed += current.categories[k].passed; }
      result.missingOrAmbiguousFacts += current.missingOrAmbiguousFacts; result.unsupportedValues += current.unsupportedValues; result.schemaIssues += current.schemaIssues;
    }
    return result;
  };
  return {
    summary: { documents: perDocument.length, withModelOutput: perDocument.filter(d => d.hasModelOutput).length, factualMetrics: addMetrics('factualMetrics'), coreMetrics: addMetrics('coreMetrics'), arraysReordered: orderingChanges.length, documentsWithReordering: new Set(orderingChanges.map(x => x.job)).size },
    orderingChanges, identityChangeCandidates, examples, monetaryMismatches: perDocument.flatMap(d => d.examples.filter((e: Example) => e.kind === 'monetary-mismatch')),
    perDocument,
    methodology: ['Exact unique identities align rows before comparing values. Positions use ISIN+page; cash uses name+currency; transactions use currency+name+bookingDate+valueDate; allocation charts use dimension+scope+label; matrices use currency then assetClass.', 'Duplicate keys are flagged and never matched arbitrarily. Reordering is counted separately. Label changes that alter a row identity remain missing/extra rows, not fuzzy matches.', 'Numeric tolerance is 0.000001. Text only normalizes Unicode, surrounding whitespace and repeated whitespace. Missing rows reduce source-fact recall; matched-field accuracy excludes missing rows and must not be reported without coverage.', 'Optional unprinted values represented as null are excluded from factual denominators. Invented non-null values and extra rows are reported separately as unsupported/schema additions.', 'Monetary metrics compare printed amounts and quotes on uniquely matched rows, not the value of omitted records. Aggregate row counts include matrix parent rows and cell rows.', 'Identity-change candidates are diagnostic only: exact unique alternative anchors and all unchanged numeric fields identify likely label/schema issues. They do not receive credit in strict source-fact scores.', 'The deterministic baseline is a source-extraction reference, not an assumption that source statements are true. Monetary disagreements require checking the original PDF and the field definition.'],
  };
}
