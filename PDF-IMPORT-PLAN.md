# External custody PDF import: findings and implementation plan

Reviewed 19 September 2026. Scope: all ten supplied eight-page statements in `unriskomega-2026/side-challenge`, plus the current import and portfolio analysis code. This is an extraction feasibility audit and implementation plan. PDF upload and attachment to a client are not implemented by this work.

## What the examples contain

All ten are fictional Privatbank Helvetia AG statements with selectable text, CHF reporting currency and a valuation date of 31 December 2025. Although titled Q4 2025, their performance reporting interval is 1 January to 31 December 2025. The cover return is annual net time-weighted return (TWR).

| Report owner | Mandate | Assets CHF | Reported 2025 net TWR | Securities | Cash balances |
| --- | --- | ---: | ---: | ---: | ---: |
| Max Muster | Balanced | 2,049,658 | 5.20% | 19 | 2 |
| Anna Beispiel | Growth | 3,406,538 | 4.12% | 18 | 3 |
| Familie Weber-Brunner | Income | 1,251,538 | 2.41% | 15 | 3 |
| Peter Keller | Equities | 4,803,193 | 6.73% | 20 | 3 |
| Laura Steiner | Balanced | 948,090 | 6.24% | 20 | 2 |
| Muster Holding AG | Growth | 7,602,477 | 7.49% | 22 | 2 |
| Daniel Frey | Income | 1,801,061 | 3.11% | 20 | 2 |
| Nicole Baumann | Equities | 2,701,278 | 7.83% | 19 | 2 |
| Pensionskasse Fiktiva | Balanced | 9,203,755 | 4.10% | 22 | 3 |
| Thomas Gerber | Growth | 1,451,315 | 4.86% | 23 | 2 |

| Pages | Available data | Product use |
| --- | --- | --- |
| 1 | Owner, depot identifier, mandate, reporting currency, valuation date, total assets, annual TWR | Client attachment preview; portfolio header |
| 2 | Opening/closing assets, net flows, monetary profit, annual performance history | Explain investment profit separately from deposits |
| 3 | Asset-class balances, flows, monetary profit, MWR and share of profit | Evidence-backed explanation of which asset classes contributed |
| 4 | Asset-class/currency matrix and unhedged foreign-currency exposure | Currency and allocation view |
| 5 | Asset-class and currency allocations; equities-only sector/region breakdowns; sustainability information | Exposure panels with explicit scope labels |
| 6–7 | Security names, ISIN/Valor, quantity or nominal, currency, cost/market quote, quote date, CHF value and portfolio weight; cash accounts | Holdings table and investment graph |
| 8 | Selected transactions, including income and fees | Source-backed activity timeline, explicitly incomplete |

The statements contain named companies, bonds and funds. They do not contain ETF constituents, per-security country/sector classifications, daily price history, conversations or a complete transaction ledger. Page 5's sector/region charts describe equities, not the entire portfolio. ESG ratings have their own equities-and-bonds scope.

## Extraction verification

The local template-specific prototype recovered 198 securities and 24 cash balances. No recognized currency-prefixed position rows were left unparsed. Summed holdings and cash reconcile to each cover total with differences of CHF 0–2, consistent with rounding; reported weights sum to 99.98–100.02%.

Processing all ten PDFs took approximately 1.2 seconds locally, including text extraction, row parsing, checksum checks and reference comparisons. Individual files took approximately 0.11–0.13 seconds. This is not an end-to-end application benchmark: upload, persistence, UI rendering, enrichment and AI generation are excluded. No model or remote API was used.

Machine-readable results: `test-results/pdf-ingestion-audit.json`. Template-specific prototype: `tmp/pdfs/ex-custody/audit.py`. Both are local audit artifacts. Financial overview and allocation semantics were inspected; they are not all structured by this prototype yet.

## Proposed client flow

1. On a client, choose **Add external portfolio** and drop a PDF. Preserve the current dataset and selected client.
2. Show a compact preview: detected owner, bank, mandate, valuation date, total, number of holdings and any unresolved fields. Offer **Attach to this client** or **Create client from report**. None of the ten report owners exactly matches the core JSON client names; the PDFs supply no matching ClientId. Do not silently infer ownership.
3. Validate and attach a separate external portfolio. Keep the original PDF and page references. Reuploading the same file is a no-op; a later report for the same confirmed account creates another snapshot rather than duplicating holdings.
4. Immediately show holdings, weights, reported performance and a factual bullet briefing. Enrich recognized securities, fund look-through and relevant news asynchronously. Missing enrichment must not block a valid statement import.

Default to the external portfolio's own snapshot. Keep managed assets and external assets distinguishable. A combined view requires compatible currencies and clearly disclosed valuation dates; do not silently add December 2025 values to a current AUM figure.

## Data representation and application changes

- Preserve owner and portfolio identifiers separately. Allocate local client/portfolio IDs; retain depot identifiers as private import metadata.
- Store source filename, content hash, page, extraction time and valuation date with each extracted fact. Preserve the source values alongside any derived values.
- Map securities to existing position fields: quantity, quoted market price, price date, CHF market value and fractional portfolio weight. Store instrument currency separately from portfolio currency. For bonds, preserve nominal amount and percentage quote basis; do not compute CHF value as nominal × quote without the appropriate quote and FX rules.
- Store cash once in AccountPositions. Use the statement's CHF-equivalent values for CHF portfolio totals; do not convert them twice.
- Introduce reported performance facts with start/end dates, methodology (TWR or MWR), net/gross label and source. Store monetary profit and net flows separately. Do not insert reported return percentages into balance-based PerformanceHistory.
- Store reported allocations with scope and denominator: whole portfolio, equities only, or equities plus bonds. Do not assign individual holdings sector/country values from aggregate chart percentages.
- Keep selected transactions as a partial statement activity collection. Do not reconstruct full performance from them.

Specific code touchpoints:

| Location | Required change |
| --- | --- |
| `src/App.tsx` | Separate PDF attachment flow from JSON dataset replacement; preview and confirm client linkage |
| `src/lib/import.ts` | Accept normalized external portfolio/source metadata and reported performance without dropping it; append atomically |
| `src/lib/types.ts` | Explicit source, snapshot, reported performance and external ownership metadata |
| `src/lib/analysis.ts` | Preserve statement price dates and identities; distinguish external assets; resolve securities with conflict checks |
| `src/lib/portfolio.ts` | Display reported interval TWR separately from balance-derived changes; mark unavailable time ranges |
| `src/lib/briefing.ts`, `src/lib/advisor.ts` | Brief and answer using imported facts, with PDF page evidence |
| `src/lib/network.ts` | Client → external portfolio → securities; shared company nodes only after identity verification |

Recommended extraction approach: deterministic text and coordinate parsing for the supplied layout, with headers and financial reconciliation as anchors. A generic table detector did not reliably find these borderless holdings tables. The existing Node server could use a PDF text extractor; the tested Python approach is another option. Do not require a new Docker service merely for these text PDFs. Unknown layouts should enter review, and scanned documents need a separate OCR path. Any future model fallback must respect the Azure-credit-only provider constraint.

## Important defects and boundaries

1. **Security identifiers are not universally reliable.** Of 52 distinct ISINs, 15 fail checksum validation. Preserve the stated security and values, flag the identifier and avoid automatic live-market matching until resolved. Do not invent corrected ISINs.
2. **Even matching ISINs can conflict.** `CH0559601544` labels a Swiss government bond in these PDFs but a Richemont call option in the JSON reference. Compare name, instrument type and currency before reusing a master record. Keep a separate unresolved external security when inconsistent.
3. **A mandate is not a client risk assessment.** “Ausgewogen” is the external portfolio mandate, not proof of the client's suitability limits or a mapping to an internal policy.
4. **Reported annual returns are not live returns.** Display “2025 reported net TWR”; do not populate 1D/7D/1M or a rolling 1Y selector with invented numbers.
5. **Contributions are not news causality.** Asset-class monetary profit supports a historical explanation. Today's articles provide current context; they cannot establish why the portfolio moved in 2025.
6. **Fund look-through is a separate source.** Named funds are visible immediately. Underlying companies and overlap require independently verified constituent data and its own as-of date.

## Demo grounded in Max Muster's report

Upload → confirm owner → external portfolio appears → brief explains:

- CHF 2,049,658 at 31 December 2025; reported 2025 net TWR +5.20%.
- Assets rose CHF 185,101: CHF 83,787 net inflows plus CHF 101,314 investment profit.
- Equities generated CHF 86,428, or 85.31% of monetary investment profit. This is a share of profit, not an equity return.
- Direct NVIDIA holding: CHF 69,330, or 3.38% of this external portfolio.

Click NVIDIA to reveal the graph path and source row. Shared verified company exposure across portfolios can be highlighted with date/scope labels. Only add indirect NVIDIA exposure through funds after constituent verification.

Other useful demo findings: Anna Beispiel and Laura Steiner report negative alternative-investment profit despite a positive total annual return. The brief can surface a weak pocket without declaring the whole portfolio unhealthy.

## Implementation order and acceptance criteria

1. **Core import:** text PDFs, explicit client linkage, position/cash extraction, source retention, dated external portfolio and deduplication. All ten provided reports must reconcile within documented rounding tolerance. Bad/incomplete extraction must enter review, not silently commit.
2. **Useful briefing:** reported annual TWR, cash-flow/profit separation, asset-class contributions and scoped allocations. Preserve citation pages and missing-data labels. Confirm UI and chat use the same facts.
3. **Demo connections:** verified shared-company graph links, asynchronous news and fund enrichment; prove unresolved IDs cannot poison the reference universe.

Validation should include all ten fixtures, duplicate uploads, different owners, currency handling, a truncated/unsupported file, conflicting security IDs and preservation of existing clients. Measure upload-to-preview and confirmed-import-to-visible-brief separately from enrichment completion.
