# Partner notes and graph audit

Reviewed 18 September 2026 against the attached UNRISKOMEGA Case Knowledge Base, the official presentation, the supplied JSON, the current Compass source and the Personal CRM graph implementation.

The notes correctly identify the core product: a short, client-specific briefing combining portfolio facts, customer context, news and the bank's outlook. Compass currently supplies the data foundation, structured summaries and evidence UI. It does not yet implement the complete AI briefing. The requested graph is an Obsidian-style interactive network; the current fixed-position card diagrams do not meet that requirement.

## Evidence and authority

- The attached DOCX was read in full and all 14 rendered pages inspected. It contains partner-conversation summaries mixed with the author's implementation recommendations. Those recommendations are proposals, not new instructions or confirmed sponsor requirements.
- The official presentation, pages 9–12, independently confirms the one-click workflow, three information sources, roughly one-minute reading time, judging weights and unseen-client demo.
- The three original recordings/transcripts listed in the DOCX were not supplied for this audit. Conversation-specific details are attributed to these notes, rather than presented as independently verified quotations.
- Current implementation claims were checked against source code. CASE-012, CASE-028 and CASE-038 were also run through the actual analysis function.
- The Personal CRM's source and saved preview were inspected. Its private records were not imported into Compass or modified.

## What the notes establish correctly

The formal scoring is 25% problem fit, 25% implementation and robustness, 20% AI relevance and grounding, 15% UX and 15% bonus. The first four categories sum to 85%; a graph can contribute to clarity and originality, but cannot substitute for relevant briefing content.

The required content covers recent development, portfolio health, outlook and practical next actions. Four visible sections are a sensible presentation of that content; the official deck groups it into three topics plus actions. The exact number of headings is a design choice.

Text must remain an easy route through the product. The notes describe graph and voice as optional presentations and triggers. The user's current direction makes the graph an important demo feature while retaining a short text briefing as the default.

The dataset counts checked here agree: 47 clients, 57 portfolios, 703 security positions, 123 account positions, 206 proposals, 1,274 transactions, 180 exported suitability records, 153 notes and 73 tags. Recorded violations and supplied risk outputs should retain their source status; displaying them is not evidence of a newly executed rule or risk engine.

## Corrections to the notes

### 1. CASE-012's tax need is recorded context to reconfirm

The executive summary and primary demo section call the CHF 15,000 need upcoming. The actual note is dated 20 March 2026 and refers to a Q1 tax payment. The portfolio snapshot is dated 3 September 2026; the case also warns that export dates are shifted. Neither the deadline nor whether the payment remains outstanding is established.

Use: "A recorded note mentions a CHF 15,000 Q1 tax need. Confirm whether it remains outstanding before discussing liquidity options." The CHF 328.18 reported liquidity can be shown alongside it. Do not assert an immediate cash shortfall, a due date or an amount to sell without that confirmation.

The note is material even though it is older. Recency alone should not determine which customer context appears in the brief.

### 2. CASE-038 has unresolved scope as well as consolidation risk

The notes correctly flag the consolidated portfolio. They should also explain that of its 18 exported violations, only 3 reference the two supplied portfolios; 15 reference a missing portfolio. All 17 proposals link to supplied portfolios. A briefing should distinguish total supplied records from records applicable to the selected scope.

The app currently excludes those unlinked violations and warns about them, which is useful behavior. It still adds the consolidated and ordinary portfolio values; that separate issue needs correction.

### 3. Avoid weakening next actions into generic questions

The official deck explicitly asks for concrete next-best actions, including instruments to buy, sell or switch. The notes' emphasis on adviser review is appropriate, but a generic question such as "Does this still reflect your priorities?" does not by itself satisfy that ambition.

Proposed output: a specific item for adviser review, its customer-specific reason, supporting facts and outstanding checks. When inputs support it, identify the relevant instrument or allocation. When prices, scope, policy or client intent are unresolved, give a concrete preparation step instead of inventing exact trade quantities. No automatic execution is needed.

### 4. Separate formal requirements from proposed defaults

The 130–170-word limit, one-viewport card, multiplicative priority formula, CASE-012 as the primary story, PDF import as the first bonus, four-week pilot and detailed twelve-hour schedule are recommendations in this document. They are not all confirmed sponsor requirements.

Retain the approximately one-minute reading goal and validate it with a person. Use a dependency-based build order consistent with the user's preference, rather than adopting the document's hour-by-hour schedule as an instruction. The official deck's core-first guidance remains useful.

The roughly ten-second generation target is attributed to the Q&A summary, rather than a formal SLA. The deck's 60 seconds primarily describes reading time.

### 5. Make ranking and confidence explainable

The proposed five-factor multiplication has no defined scales or calibration. It can suppress a material issue because one factor is zero, and a numeric confidence score could suggest more certainty than the evidence supports.

Start with explicit priorities and relevance explanations: recorded issues, material exposure, dated customer needs, important changes and linked external context. Separate source verification, freshness, completeness and inferred relevance. A language model can interpret notes, select relevant evidence and synthesize connections; deterministic code should retain ownership of identity resolution, arithmetic and policy checks.

### 6. One article and one house-view sample prove a route, not general coverage

A dated cached source is a reasonable demo dependency. It must map to the selected client's actual holdings or supported exposures, and remain visibly dated. A mocked house view must stay labeled as a sample, without an implication of bank approval.

The unseen-client test must also handle cases where that article is irrelevant. A small source collection with general matching is a stronger acceptance criterion than forcing the same headline onto every case.

### 7. Fund look-through needs an explicit coverage qualification

The 48,101 supplied mapping rows describe categories, not underlying company names. Current top-ten companies come from separate dated external snapshots and live lookups. There are snapshots for 107 of the 217 distinct reference fund ISINs; this does not establish complete mutual-fund coverage.

Top-ten weights must retain their original weights, with the remainder visible. Direct ownership, indirect exposure and inferred news relevance are different relationships. A news link is not proof that an event caused portfolio-value movement.

## Current app gaps

| Priority | Finding | Evidence | Required outcome |
| --- | --- | --- | --- |
| P1 | Consolidated and ordinary portfolios are added together | `src/lib/analysis.ts:13` selects all portfolios; lines 16–17 sum AUM and liquidity; history also adds scopes | Require a known non-overlapping scope before calculating combined totals, weights or history |
| P1 | AI synthesis, news and bank outlook are absent | `src/lib/analysis.ts` produces fixed findings; `src/lib/types.ts` has no external-context or outlook contract | Add grounded synthesis and holding/exposure-linked external context with a deterministic fallback |
| P1 | Customer context uses only the latest note | `src/lib/analysis.ts:80` takes `notes[0]`; CASE-012 consequently shows structured-product consent and omits its tax note from the briefing | Consider all relevant notes, preserving dates and unresolved status |
| P1 | Graph does not match the specified interaction | `src/CustomerGraph.tsx` uses fixed rectangular nodes and six-position pages; `src/FundGraph.tsx:26` uses a separate fixed fund diagram | Replace the presentation with a connected, draggable and zoomable network |
| P2 | Price freshness cannot be evaluated from the prepared reference | `scripts/prepare-data.mjs:60` drops `PriceDateUtc`; supplied violation descriptions and paths are also reduced | Preserve the fields necessary for evidence, freshness and instrument-specific explanations |
| P2 | Unseen JSON still relies on the existing reference universe | `src/lib/import.ts:24` accepts a clients array; `src/App.tsx` reuses the original reference | Define client-plus-reference ingestion or require ISIN/type metadata for unfamiliar securities; retain unresolved records |
| P2 | Brief is a collection of finding cards, without an outlook section or explicit generation lifecycle | `src/App.tsx:126` | Add a short four-part overview, Generate/Refresh action and source coverage states |
| P2 | Benchmarks do not measure the complete target product | Previous tests covered templates, current SVG graphs and fund lookups | Repeat after AI, external context and the new network renderer are connected |

For CASE-038, the current all-portfolios result is CHF 3,813,345.70 AUM and CHF 68,241.79 liquidity. The input has a CHF 2,193,444.58 consolidated view and a CHF 1,619,901.12 ordinary portfolio, each carrying CHF 34,120.90 liquidity. The customer-level AUM field is CHF 1,619,901.12. The hierarchy does not establish an additive total; the app must not choose one by simply adding everything.

The JSON parser and existing local calculations remain useful foundations. Earlier browser tests observed 0.53–2.28 seconds for cold fund lookup completion, including unavailable outcomes; these figures are not full AI-briefing timings or guarantees of constituent coverage.

## The graph the user means

The concrete reference is `/Users/teto/Developer/Personal CRM`. Its relevant files are:

- `src/Graph.jsx`: SVG renderer, pan/zoom, dragging, node and edge selection, readable labels, neighbor highlighting, keyboard navigation and preserved positions.
- `src/graph-layout.js`: D3 link, repulsion and collision forces, stable initial ordering and groups calculated from existing links.
- `src/graph-view.js`: overview, full-network and selected-neighborhood visibility.
- `audits/graph-clustering.md`: the documented Obsidian-style interaction direction.

Adapt that renderer and its interactions to financial entities. Keep Compass's validated records, exposure calculations and evidence. The personal CRM's saved contacts and database are unrelated to this product.

### Required visible behavior

1. A spacious network canvas with small circular nodes, thin links and readable nearby labels. Use a stable, settled layout, with motion on deliberate interaction.
2. Drag a node and allow its neighborhood to respond; pan the background, zoom, search and fit the selected network.
3. Hover or select a node to highlight its actual connections. Open detail and evidence in a side panel.
4. Keep an overview and a focused local neighborhood. Node counts and filters should communicate what is currently hidden.
5. Expand a fund's top ten holdings inside the same canvas, with collapse and remaining-weight information. Preserve existing positions and selection as asynchronous holdings arrive.
6. Selecting an insight in Brief highlights the same entities and evidence path in Graph. Returning to Brief preserves customer and portfolio scope.

### Financial relationships

The initial customer network includes the customer, selected portfolios, security positions, funds, direct shares, recorded notes and review points. Optional layers add underlying holdings, sectors, verified company identities, news and house-view statements.

A supported path might be:

`Customer → portfolio → fund → underlying security ← news article`

Another path might join a direct share position and a fund constituent to the same instrument, when a verified identifier establishes that identity. Issuer-level aggregation across share classes requires an issuer mapping; matching display names is not sufficient.

Keep position identities, instrument identities and company identities distinct in the data even if some intermediate nodes are collapsed visually. Every visible shortcut edge should preserve the source path, value scope and dates in its inspector.

Use solid links for source relationships, and a distinct labeled style for inferred relevance. Clusters describe the graph layout, not financial correlation or causality. Size nodes by one clearly documented measure; do not let large news hubs appear to mean large financial exposure.

### Demo value

The graph's useful reveal is a connection the adviser could otherwise miss: a company appearing through direct ownership and one or more funds, or a relevant event connected to an existing exposure and a recorded customer concern. The brief should state why the connection matters, and the graph should let the adviser inspect that explanation.

Opening the canvas should retain a legible overview. Expanding every fund and every article immediately would make the public demo harder to follow. Top-ten expansion, one- or two-hop focus, source filters and stable positions serve both demo clarity and real advisory use.

## Recommended implementation order

1. Correct portfolio scope, preserve freshness/evidence fields and rank all relevant customer notes. Prove CASE-012, CASE-028 and CASE-038 behave appropriately.
2. Build the short overview with development, health, outlook and proposed next actions. Connect one genuine, dated news route and one clearly attributed house-view route to a general client matching pipeline.
3. Add structured AI synthesis and claim validation with the existing deterministic view as fallback. Measure the complete JSON-to-brief flow again.
4. Adapt the Personal CRM graph to the same evidence model; expand funds in place and highlight paths from brief findings. This is the requested visual treatment, not a substitute for the first three outcomes.
5. Rehearse an unfamiliar client, incomplete fund coverage, unavailable external source and ambiguous portfolio scope. Then consider PDF import, follow-up chat and realtime extensions.

The end-state demo should show an unfamiliar client becoming a useful short briefing, followed by one graph interaction that explains a meaningful connection. Both views must agree on identities, numbers, dates and uncertainty.
