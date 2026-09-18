# Repository inspection: UNRISKOMEGA 2026

Scope note: The measured data findings below remain relevant. Product recommendations referring to realtime are from an earlier direction; `WINNING-PLAN.md` now defines the initial release as a customer brief with switchable text and graph views.

Inspected local clone `unriskomega-2026`, commit `134d6ff` (Initial commit). Source: https://github.com/START-Hack/unriskomega-2026. This is a dataset and design-reference repository, not an existing application. No application tests or backend services are included.

Reproduce the aggregate checks with `python3 audit_case_data.py` from this workspace. The script reads the clone without changing it and prints no IBANs or client names. Counts below are measured from the actual JSON, rather than inferred from its documentation.

## What is supplied

| Material | Verified contents |
| --- | --- |
| `clients.json` | 47 clients, 57 portfolios; nine clients have multiple portfolios |
| Current positions | 703 security position rows and 123 account position rows |
| Conversation context | 153 client notes; all 47 clients have notes |
| Existing advisory work | 206 proposals across 29 clients; 1,274 transaction records across 28 clients |
| Recorded suitability findings | 180 violations across 26 clients; 177 have evaluation traces |
| Proposal statuses | 125 Final, 76 Abgelehnt (rejected), 5 Entwurf (draft) |
| History | 58 monthly observations per portfolio, 3,306 observations total |
| Security reference | 504 security rows, including 12 ISIN groups with multiple rows |
| Fund breakdowns | 48,101 rows covering 141 funds |
| Advisory reference | 54 suitability rules, 16 strategic asset allocations, five risk profiles, two ESG profiles |
| Recommendation list | 232 security entries in one exported list |
| Other materials | Three existing-UI screenshots, ten quarterly PDF reports and brand assets |

The README explicitly says three additional same-shape client files will arrive for the live presentation. File ingestion must work for new clients; a hardcoded demo is insufficient.

## What this enables in the product

The strongest core workflow is: open client → prepare evidence-based brief → listen to the conversation → update goals and proposed scenarios → calculate changes → review a sourced proposal.

- Client notes provide existing goals and preferences, so the live model can recognize a change rather than start every conversation from nothing.
- Existing proposals provide continuity. The system can surface an existing draft or prior rejected proposal for review; rejection alone does not establish why it was rejected.
- Holdings, fund breakdowns and target allocations give the graph useful relationships: client → portfolio → holding → sector/currency/region → target or recorded issue.
- Rule traces supply reported actual and threshold values. Keep the exported rule finding and its date separate from newly calculated facts.
- Recommendation-list membership provides a bounded universe for exploring alternatives, but membership alone does not establish suitability.
- Current risk-engine outputs are displayable where present. The repository supplies no callable risk engine or covariance model for recalculating exact volatility/VaR after a proposed trade. Calculate allocation and cash changes directly; do not fabricate new portfolio risk figures.

Realtime should receive a compact selected-client context and use application functions to request additional evidence. It should not receive the entire ~18 MB JSON corpus on every utterance. The backend holds the authoritative draft; validated model updates trigger deterministic calculations and both the graph and proposal render the same state.

Draft edits can happen automatically as speech becomes interpretable. Treat corrections as revisions and preserve source segments. Approval belongs to the final handoff, not every intermediate draft change.

## Strong demo candidates grounded in core data

### CASE-012: a goal, limited liquidity, and a changing proposal

This client has five security positions, 18 proposals, 21 recorded violations and a note requesting approximately CHF 15,000 in liquid funds for a Q1 tax payment. Portfolio liquidity is CHF 328.18. If the goal is reconfirmed against this snapshot, the arithmetic shortfall is CHF 14,671.82, before transaction costs and other effects.

A useful demonstration:

1. The brief surfaces the note and reported liquidity, with their sources.
2. The client confirms or changes the required amount and timing during the call.
3. The graph connects the liquidity goal to cash and candidate holdings; the draft presents options with explicit assumptions.
4. A spoken correction changes the goal, required proceeds and scenario figures together.
5. The advisor reviews the alternatives and supporting evidence.

The exported dates are shifted, so the Q1 note is not proof of an upcoming real-world deadline. Reconfirm the goal in the demo dialogue. Do not treat every exported violation as a freshly recomputed outcome. CASE-012's portfolio joins resolve, making it a cleaner starting candidate than cases with missing linked portfolios.

### CASE-005-01: reveal exposure inside funds

Funds with supplied breakdowns represent 71.32% of portfolio weight. Normalizing the small rounding differences in each fund's breakdown gives approximately 16.58% of portfolio weight classified as Information Technology through these funds. This is an attributed portion of exposure, not a claim that all remaining holdings are classified or that risk suddenly increased.

Useful interaction: a client asks about technology exposure; the graph expands funds into sector allocations and exposes the sources. This gives the graph a substantive purpose beyond decoration.

### CASE-038: preferences across portfolios, with a data caveat

The client has two portfolios, 88 security position rows and notes expressing sustainability preferences, a benchmark comparison request and a wish to avoid fossil-fuel exposure. This can demonstrate preference-aware preparation. However, 15 of its exported violation records point to portfolios absent from this client's export. Also, an Energy sector category alone cannot prove fossil-fuel involvement. Use this as a secondary case until those limitations are handled.

## Data findings that affect implementation

1. **Nulls exist.** Documentation says absent fields replace nulls, but the JSON contains many null fields, including entire client collections. Use null-safe collection handling.
2. **No `PerformanceYTD` values exist in the 57 portfolio objects.** All have monthly history, but do not silently label NAV change as investment return without knowing cash-flow treatment. Current volatility is present in 50 portfolios; expected return and VaR are each present in 51. Only one security reference row has `ExpectedReturn` populated.
3. **Some documented joins do not resolve.** One CASE-008 proposal and 27 violation records point to portfolios absent from the same client's export: 12 violations in CASE-008 and 15 in CASE-038. Preserve them as unlinked records; do not attach them to a different visible portfolio. All current holding SecurityId links and all transaction-to-proposal links resolve. Checked client profile and portfolio SAA/service/strategy links also resolve.
4. **Fund breakdown rows have multiple dimensions.** All 48,101 rows have multiple populated classification fields, contrary to the suggestion that only one dimension per row is meaningful. Group the same weighted rows separately by the selected dimension. Each fund's total weight is approximately 100 (observed 99.99993–100.00173). Do not add industry, currency and region aggregates together; that would count the same exposure multiple times.
5. **Mixed units and taxonomies matter.** Position/SAA weights are fractions, fund weights are percentage points. SecurityId is the reliable security join; ISIN can be ambiguous. SAA comparisons need the `SAA_*` classifications. Preserve unknown/unmapped categories and rounding residuals.
6. **Account rows are not all fiat cash.** Some use BTC, ETH, SOL, SHIB and other nonstandard currency values. Do not classify every account row as immediately available cash.
7. **Currency scopes differ.** Portfolio AUM/liquidity fields are documented in the client's reporting currency, while position totals are in portfolio currency. Reconcile scope before computing totals or shortfalls across portfolios.
8. **Dates have specific semantics.** Most export dates are shifted; price and factory-calculation dates are documented exceptions. Current news must not be presented as the cause of historical/shifted portfolio changes.
9. **Rule operators are opaque.** Evaluation traces include internal operator codes that the documentation does not decode. Display the supplied finding and trace, and implement only independently understood comparisons.
10. **Some IBANs may be real.** The repository explicitly documents this. Redact account identifiers from demos, model payloads, screenshots and generated reports. This inspection report contains none.

## What is not supplied

There is no news feed, bank investment-view document, live speech service, executable advisory backend, executable suitability engine or demonstrated causal market model in the clone. Those are separate integrations or clearly labelled sample inputs. The fund breakdown rows are category exposures, not a full constituent-company ownership graph. Issuer resolution is also not provided as a dedicated issuer master.

The PDF side challenge remains useful for external-portfolio import, but the core JSON already provides a stronger basis for the main conversation/proposal story. Do not merge a PDF portfolio with a core client without establishing matching ownership and compatible valuation scope.

## Recommended implementation order

1. Normalize and index the actual JSON, including nulls and unresolved links.
2. Build the selected-client brief and evidence lookup; support new same-shape uploads.
3. Define the shared draft state: goals, constraints, scenarios, evidence and revisions.
4. Connect Realtime to small draft-edit and evidence-request functions.
5. Calculate supported allocation/cash outcomes and render the focused graph.
6. Add news and bank-view enrichment asynchronously; retain source/date labels.
7. Demonstrate CASE-012's changing liquidity goal and CASE-005's fund exposure reveal, then validate the same workflow against other clients.
