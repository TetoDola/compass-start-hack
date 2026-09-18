# Customer Brief — solution plan

Status: implementation plan. This replaces the previous realtime-first plan. The first release is a customer-data briefing product with switchable text and graph views. Realtime, transcription and evolving investment proposals are future extensions.

## 1. Product idea

An advisor selects a customer and receives a concise, evidence-backed brief answering:

1. **What happened?** Relevant recorded developments and advisory history.
2. **What is going on?** The current portfolio situation, customer needs and items requiring attention.
3. **What should I discuss next?** The most useful questions or follow-up points supported by the data.

The same brief can be read as text or explored as a relationship graph. The text provides a quick understanding; the graph explains how the findings connect to the customer's notes, portfolios, holdings, exposures and recorded issues.

The product should work for every supplied customer and new same-shape client files. Its logic must not depend on particular client IDs, instruments or scripted stories.

**Product promise: Understand your customer before the conversation starts.**

## 2. First-release scope

| Included | Expected behavior |
| --- | --- |
| Customer selection | Search and open supplied customers; show their portfolios |
| New-file import | Accept additional customer JSON in the documented format |
| Customer snapshot | Summarize reporting currency, assets, liquidity, strategy and available profile information |
| Three-part brief | Explain what happened, the current situation and next discussion points |
| Text view | A concise narrative with prioritized findings, small supporting visuals and source links |
| Graph view | An interactive explanation of the same findings and supporting relationships |
| Evidence inspection | Open the source note, record, field or calculation behind a claim |
| Portfolio scope | Customer overview plus filtering to a selected portfolio |
| Reliable empty/error states | Explain unavailable information while retaining supported findings |

Deferred: live audio, transcription, GPT Realtime, automatically evolving proposals, scenario/trade simulation, trade execution, external messaging and PDF import. News and bank-view ingestion can extend the brief later; the initial product uses the supplied customer and reference data. Reconcile these extensions with the full case requirements before claiming the complete competition submission is finished.

Do not add backend abstractions for future realtime features during this phase. Shared analysis objects are sufficient to leave a sensible extension point.

## 3. Navigation and user flow

### Navigation decision

Use **one customer workspace with a `Brief | Graph` view switch**, rather than unrelated pages. Default to Brief. Both views share the selected customer, portfolio scope, finding and generated analysis.

Switching views must not run a new analysis, change any numbers or reset context. A finding selected in the brief opens its corresponding graph explanation; switching back highlights the same finding in the text. The UI can preserve the view and selection in the URL for back navigation and sharing within the app.

### Primary flow

1. Open the customer list or import a file.
2. Select a customer.
3. See the customer snapshot and preparation status.
4. Read the generated three-part brief.
5. Select a finding to inspect its evidence, or use **Show in graph**.
6. Explore the relevant relationships in Graph view.
7. Return to Brief with the same finding selected.
8. Optionally change portfolio scope or open another customer.

The advisor should reach a useful brief without configuring a model, prompt or analysis workflow.

### Layout

```text
URO-style application header
Customer selector | Customer identity | Portfolio scope
Assets | Reported liquidity | Strategy/profile | Data dates

                         [ Brief | Graph ]

Brief view                         Graph view
One-sentence summary               Focused relationship graph
What happened                      Finding selector
What is going on                   Expand/collapse relevant connections
What to discuss next               Selected finding explanation

                Shared evidence drawer when requested
```

Use the supplied screenshots for visual context: blue branding, a light enterprise workspace and readable financial information. Keep the view switch easy to find. Keep customer and portfolio identity visible in both modes.

## 4. Content of the brief

### Customer snapshot

Present the useful available fields: customer reference, portfolio count, reporting currency, assets, reported liquidity, investment strategy and risk/ESG profile. For a multi-portfolio customer, label figures as customer-level or portfolio-level. Do not sum incompatible currency values.

### What happened

Summarize recorded events and changes that the source data actually supports:

- Recent dated customer notes and recorded requests.
- Proposal creation/finalization/status information where dated.
- Relevant associated transaction records, without assuming order submission means execution.
- Portfolio-value development over the available monthly history.

Use a compact timeline or two to three bullets when helpful. Omit unsupported chronology. A current proposal status is not proof of a complete status-change history. An event without a timestamp may be relevant context but cannot be presented as the latest event.

The dataset does not include a full history of holdings or transactions sufficient to explain every change in value. Never invent “the portfolio rose because of X.” Label simple value changes as portfolio-value changes, not investment performance, unless the return methodology is established.

### What is going on

Prioritize current facts and meaningful connections:

- Current composition and important holdings/exposures.
- Recorded suitability issues and supported target-allocation deviations.
- Liquidity in relation to a documented customer need, if amounts, timing and currency scope permit comparison.
- Fund-derived exposures, with coverage and unknown portions visible.
- Existing draft or prior proposals relevant to the next review.
- Customer preferences and information that may need reconfirmation.

Every finding should explain both the observation and why it matters for this customer. A recorded violation remains a recorded violation; it is not automatically a freshly calculated conclusion.

A healthy or sparse-data customer still receives a useful brief. Do not force a warning or financial action to make the screen more dramatic.

### What to discuss next

Generate a small number of practical discussion prompts from the supported findings. Examples of question patterns:

- Does the previously noted liquidity need still apply, and is the amount/timing unchanged?
- Is the observed exposure intentional within the customer's strategy?
- Should the existing draft proposal be revisited?
- Has a recorded preference changed since the last note?

These are **suggested questions**, not conversations found in the dataset. The source contains client notes and proposal reasons, but no actual conversation transcripts. Do not present generated wording as a client quote.

### Standard finding format

Each finding has a short title, a factual observation, customer relevance, supporting source links and an optional next question. Show any material limitation alongside the affected claim. Aim for a default brief readable in approximately 60 seconds, usually around 200–300 words excluding expanded evidence; verify this with readers instead of treating word count as proof.

## 5. Graph view

### Purpose

The graph opens on a **customer-centered relationship overview**: the customer connects directly to actual investment positions, with the owning portfolio named on each link. Recorded preferences, notes and advisory context connect to the same customer. Search and progressive disclosure keep every position accessible without displaying every record at once.

Clicking an investment opens its value, portfolio, weight and original source. Related findings open focused explanations answering **“How does this finding connect to the customer's situation?”** The overview and focused graphs share the same analysis as the text brief. A customer-level note is not automatically linked to a particular holding.

The September 18 presentation confirms the next integration phase: market news and the bank's CIO/house view must join client/portfolio data in a concise AI briefing. Slide 10 illustrates a semiconductor holding, earnings news and a house-purchase goal; this is an illustrative scenario, not a supplied Nvidia position or verified price-attribution dataset. Initial implementation remains customer-data only, without realtime.

### Supported nodes and connections

| Relationship | Evidence |
| --- | --- |
| Customer → portfolio | Exported ownership relationship |
| Customer → goal/preference | Customer note or assigned profile/tag |
| Portfolio → holding | Current position record |
| Holding/fund → exposure category | Security classification or supplied fund breakdown |
| Portfolio/exposure → target | Compatible strategic asset-allocation definition |
| Portfolio → recorded issue | Resolved exported violation record |
| Customer/portfolio → proposal | Existing proposal and valid relationship |
| Finding → supporting evidence | Source record or deterministic calculation |

Represent model-inferred relevance differently from a direct source relationship. Do not label an inferred association as causality. The fund data provides category exposures, not a complete graph of underlying companies. Issuer-level grouping should wait until a reliable issuer relationship is available.

### Interaction

- Initially show the top finding and a small set of useful connected nodes, approximately 6–12 where appropriate.
- Let the advisor choose another finding, click nodes for details and expand relevant connections.
- Provide a reset-to-finding control after panning or expanding.
- Use stable positions and restrained transitions; labels and amounts remain readable.
- Keep a short textual explanation of the selected finding visible in Graph view.
- Show relationship labels and relevant numeric values. Avoid decorative connections without meaning.
- Use badges/line styles as well as color to distinguish facts, calculated findings and interpretations.

A small historical chart belongs inside a finding or evidence panel when that communicates change better than graph nodes. Use the graph for relationships, not every type of information.

## 6. General analysis pipeline

```text
Customer JSON + reference JSON
              ↓
Normalize, validate and resolve links
              ↓
Build selected-customer facts and calculate supported metrics
              ↓
Create candidate findings with source references
              ↓
Prioritize and synthesize a structured brief
              ↓
One shared analysis object
              ↓
        Brief view ↔ Graph view
```

### Deterministic responsibilities

Application code resolves identities and source links, handles currency/units, performs arithmetic, computes exposure and compatible target comparisons, and builds graph relationships from known data.

### AI responsibilities

AI interprets the short notes, synthesizes customer context, prioritizes supported findings, explains their relevance and drafts discussion questions. Provide a compact selected-customer fact bundle; do not repeatedly send the full repository.

Use one structured generation request for the initial brief where practical. A multi-agent runtime and retrieval framework are unnecessary for the initial structured dataset. Let AI reference only supplied fact/source IDs. Validate returned structure, IDs and numerical claims before displaying the result. If generation fails, show the verified snapshot and available calculated observations with a retry option.

### Finding selection

Use a small set of reusable finding categories: recorded events, customer needs, exposures, target comparisons, recorded issues and proposal follow-up. Rank by materiality, documented customer relevance, actionable discussion value and evidence strength. Recency matters only when the timestamp is available and meaningful.

Avoid a complex scoring engine. Prefer a few explainable rules plus AI ordering/synthesis. Deduplicate overlapping findings and avoid treating repeated template notes as independent evidence. Do not infer why a proposal was rejected from its status alone.

## 7. Shared analysis structure

Keep the contract small:

| Object | Contents |
| --- | --- |
| Customer context | Dataset identity, customer reference, portfolio scope, currency and snapshot fields |
| Source | Stable ID, record/field locator, date when available and displayable evidence |
| Metric | Value, unit, scope, date, calculation inputs and coverage/limitations |
| Finding | Stable ID, category, title, observation, relevance, priority, source/metric IDs and optional discussion question |
| Brief | Summary plus ordered finding IDs for the three sections |
| Graph | Nodes and edges derived from those findings and their validated source relationships |

The graph is derived from the validated analysis, not generated independently by another model. Both views display the same metric values. UI state needs only the selected customer, portfolio scope, view, finding and open evidence item.

Cache analysis by dataset version, customer, portfolio scope and analysis/prompt version. Switching views uses the cache. Importing changed data creates a new analysis version. Start with in-memory indexes and a simple local cache; no database is required until persistence is demonstrably needed.

## 8. Data handling requirements

Use `REPOSITORY-FINDINGS.md` and the actual JSON as the implementation reference, accounting for documentation mismatches:

- Accept absent fields and explicit nulls, including collections.
- Resolve holdings by `SecurityId`, not ambiguous ISIN alone.
- Keep unknown security records visible with available values and unresolved classifications.
- Preserve unlinked proposals/violations separately; never attach them to the wrong portfolio.
- Distinguish position/SAA fractions from fund percentage-point weights.
- Group fund breakdown rows separately by each dimension; do not add sector, country and currency totals together.
- Show fund/classification coverage and unknown exposure. Normalize only small rounding differences.
- Use compatible `SAA_*` fields when comparing to targets. Preserve categories that cannot be mapped confidently.
- Respect customer-versus-portfolio reporting currencies and supplied conversion scopes.
- Distinguish crypto-like account rows from fiat cash. “Reported liquidity” and “eligible cash” are not automatically interchangeable.
- Handle shifted dates explicitly; do not label a fixture deadline as upcoming in the real world without justification.
- Do not fabricate the absent `PerformanceYTD` field or new volatility/VaR figures.
- Exclude placeholder proposal notes such as “Comment” from summaries.
- Redact potentially real IBANs from the UI, exports, model inputs and logs.

For imported customer files, reuse the same pipeline. Identify records within their dataset context; do not merge customers across files solely because IDs collide. Allow an updated reference file if additional lookups are supplied. Unknown references must not prevent the whole brief from loading.

## 9. Architecture

Build a single TypeScript web application with a React interface and server-side routes for importing data, computing facts and generating the brief. Choose standard UI/chart/graph components during implementation. Keep the existing URO visual context.

Suggested modules:

- `data`: parsing, normalization, indexes and source locators.
- `analysis`: calculations, candidate findings and structured brief generation.
- `views`: customer list, Brief, Graph and evidence drawer.

Keep API credentials on the server and avoid logging raw customer payloads. There is no requirement for GPT Realtime or Jev in this phase. Select a text model based on structured-output quality, grounding and measured generation time. Do not introduce a graph database, vector database, event bus or agent orchestration framework for this dataset.

## 10. Build order and completion gates

| Step | Deliverable | Completion gate |
| --- | --- | --- |
| 1. Data foundation | Import, normalization, indexes and source references | All supplied customers load; nulls, missing links and currency scopes are handled |
| 2. Analysis object | Snapshot, metrics, candidate findings and evidence | Supported calculations are independently checked; every finding resolves to sources |
| 3. Text brief | Customer selection, three sections and evidence drawer | A user can understand a customer without consulting raw JSON |
| 4. Graph view | Relationship projection, finding selection and view switch | Graph/text show the same findings; switching preserves scope and selection |
| 5. Generalization | New-file import and broad customer coverage | Unfamiliar same-shape inputs follow the same flow without client-specific code |
| 6. Presentation quality | Readability, stable layout, loading/error behavior and reset | The brief is understandable in 60 seconds and the graph is legible on a projector |

These are dependency stages, not arbitrary time limits. Build the text brief before polishing the graph so the visualization explains a useful analysis. Build both before starting future realtime features.

## 11. Validation

Test behavior that affects trust and usability:

- Every supplied customer produces either a supported brief or a specific, recoverable data error.
- New customer IDs and unfamiliar holdings do not depend on special-case code.
- Single- and multi-portfolio customers retain clear scope.
- Sparse data and no recorded violations produce a sensible routine-review brief.
- Timeline claims have supporting dates; current status is not presented as an invented transition.
- Calculations handle weights, coverage and currencies consistently.
- Repeated notes and placeholder text do not create spurious insights.
- All material numeric claims resolve to stored metrics or source values.
- Suggested questions are labelled as generated discussion prompts.
- Switching Brief/Graph causes no regeneration or metric changes.
- Clicking a finding focuses the right graph and evidence; changing customers clears previous selection.
- Network/model failure preserves verified data and offers retry.

Use multiple customer types to exercise the generic logic: liquidity-related notes, fund-heavy holdings, recorded issues, existing proposals, multiple portfolios and minimal information. Choose showcase records only after these flows work.

For usability, ask a fresh reader to explain the customer's situation after 60 seconds, and ask what the graph added to their understanding. Adjust content and visual hierarchy from the result. Measure generation time and repeated-navigation responsiveness before stating performance claims.

## 12. Demo and later roadmap

### Initial demo

1. Open a customer and show the compact snapshot.
2. Read the three-part brief: history, current situation, next discussion.
3. Select one meaningful finding and switch to Graph.
4. Reveal the supporting relationship and open its source.
5. Switch back to Brief with the same finding selected.
6. Open another customer or import a fresh file to demonstrate generality.

For partner judging, emphasize evidence, data handling and useful preparation. For public voting, emphasize one immediately understandable insight and how the view switch makes it clear. The graph should explain the brief more effectively, not merely look more complex.

### Later extensions

After this release works, assess news/bank-view enrichment against the case requirements, then PDF import, grounded follow-up questions, live conversation updates and proposal/scenario workflows. Realtime would update the same analysis model in a later phase; its session machinery is not part of this build.

### Definition of done

A customer can be selected or imported, understood through a concise sourced brief, explored in a synchronized graph, and switched without special-case behavior. The product clearly separates recorded facts, calculated findings and suggested discussion points. The first version is complete when that preparation workflow is accurate, useful and presentable.

## Supporting materials

- Local clone: `unriskomega-2026/`
- Data audit: `REPOSITORY-FINDINGS.md`, `audit_case_data.py`, `repository-audit.json`
- [Official repository](https://github.com/START-Hack/unriskomega-2026)
- [Official data reference](https://github.com/START-Hack/unriskomega-2026/blob/main/core-case/portfolio-data/DATA.md)

The data audit's earlier live-copilot recommendations are historical context. This document is the current product scope.


## Implemented refinement: fund constituents and surprise-case ingestion

Funds expand into at most ten published underlying holdings, with remaining weight, source and date. Direct shares are named companies; funds are labeled Fund / ETF. Sector mappings are a separate fallback, not invented company constituents.

Ingestion renders the brief immediately and enriches funds by exact ISIN in the background. Prewarm all provided reference fund ISINs before judging, package cached results, and use bounded background requests for missing funds. Preserve dated snapshots on source failure. The present public ETF adapter covers 107 of 217 reference fund ISINs; guaranteed coverage, especially for mutual funds, needs an additional holdings source. Do not claim universal coverage or guaranteed network latency.
