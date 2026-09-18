# Compass — customer brief and financial network

A local UNRISKOMEGA prototype: import a customer, read a short four-part brief, then follow the evidence through an Obsidian-style financial network. Realtime transcription remains deferred.

The supporting challenge presentation, consolidated case knowledge base, source transcripts, pitch-deck materials and document render history are preserved in [`knowledge/`](knowledge/README.md).

## Run

Node.js 22.12+ and npm are required (tested with Node 26).

```sh
git clone --recurse-submodules https://github.com/TetoDola/compass-start-hack.git
cd compass-start-hack
npm install
npm run dev
```

For an existing checkout, run `git submodule update --init --recursive` before starting.

Open `http://127.0.0.1:5173`. The preparation script reads the existing `unriskomega-2026/` clone and packages sanitized customer records, fund category breakdowns and dated constituent snapshots.

```sh
npm run build
npm test
npm run preview
npm run benchmark:brief  # requires the dev server on port 5173
```

The API adapters run under both Vite dev and preview. A static-only deployment needs a backend for news, AI selection and fresh fund lookups. This is a local prototype, without production authentication.

## What works

- Source records inside the portfolio workspace: customer profile, notes, positions, account balances, proposal history, recorded review points, policy targets and source inspection.
- Four-part brief: development, portfolio health, outlook and preparation actions. Customer facts appear immediately; news enriches them asynchronously. Refresh shows progress, generation mode and elapsed time. The exported Markdown includes attention findings, material headline flags, the selected briefing sentences and source locations.
- Material customer notes are ranked ahead of routine notes while retaining their original dates. Old liquidity needs are explicitly reconfirmed.
- Consolidated and ordinary portfolio views are not added together when overlap is unresolved. Combined totals, weights and history remain unavailable until an individual scope is selected.
- An Obsidian-style D3 graph, adapted from the user's Personal CRM renderer: circular nodes, force layout, drag, pan, zoom, fit, keyboard navigation, search, layer filters, neighborhood focus and evidence/relationship inspection. No Personal CRM records are used.
- Funds expand their top ten constituents inside the same canvas. A verified identical ISIN can connect a direct position and several funds. Names alone do not merge identities, and different share classes remain distinct. Position evidence and currency stay separate even when the visual instrument node is shared.
- Solid links describe source relationships; dashed links show inferred news relevance. Node size reflects connection count, not financial exposure. Clustering does not represent correlation or causality.
- Client-array and client-plus-reference JSON ingestion, with restore and missing-reference handling. Dates, price dates, rule descriptions and rule paths survive projection.

## News and provider choices

The working no-key route uses public Google News RSS searches across covered company, industry and geography exposures, progressively in batches of twelve. Publication windows are 1, 7, 30 or 365 days, independently of case-history dates. Each search returns up to two ranked, dated headlines. Relevance and materiality use explicit lexical rules, not validated impact analysis; coverage is shown and this is not a complete market monitor.

Only public company identifiers/names and exposure category names are sent to news providers. Customer names, notes, portfolio amounts and account identifiers are not included in news queries. News relevance is inferred; even an exact security match does not prove a headline caused any price movement. Case export dates are shifted and are never aligned to live news as if they shared a historical timeline.

Optional provider configuration lives in `.env.local` (copy `.env.example` and restart the server):

| Variable | Purpose |
| --- | --- |
| `FMP_API_KEY` | Exact ISIN-to-ticker resolution, ETF/fund holdings, and company news |
| `OPENBB_BASE_URL` | Existing OpenBB API prefix, e.g. `http://127.0.0.1:6900/api/v1` |
| `OPENBB_NEWS_PROVIDER` | Underlying provider, default `yfinance` |
| `OPENBB_SYMBOLS` | Explicit ISIN-to-provider-ticker JSON map when no FMP resolver is available |
| `OPENAI_API_KEY` | Enable AI selection of evidence-backed briefing and chat answer blocks |
| `OPENAI_MODEL` | Model for structured selection; default `gpt-5-mini` |

Keys stay server-side; never use a `VITE_` prefix for secrets. No keys are configured in the current workspace.

OpenBB provides a common API over underlying data providers; self-hosting it does not create new data entitlements. Its adapter is implemented and fixture-tested, but no OpenBB server was installed or live-tested. It needs an exact ticker mapping: use an explicit `OPENBB_SYMBOLS` map or FMP ISIN resolution. Requests go to `/news/company` relative to the configured API prefix. Failed or unavailable providers fall back to RSS and disclose the coverage limitation.

FMP uses `/stable/search-isin`, `/stable/etf/holdings` and `/stable/news/stock`. Fund results require matching fund symbols, consistent update dates and valid original weights. Live FMP access and market coverage are unverified until a key with endpoint access is supplied. The supplied reference already contains fund sector/region breakdowns, so this version does not add redundant calls to FMP's sector and country endpoints.

The teammate's Parse marketplace listing advertises ETF search/profile/prices/performance, but not constituent holdings. It is not wired into the holdings path.

Official references: [OpenBB company news](https://docs.openbb.co/odp/python/reference/news/company), [FMP holdings](https://site.financialmodelingprep.com/developer/docs/stable/holdings), [FMP ISIN search](https://site.financialmodelingprep.com/developer/docs/stable/search-isin), [FMP company news](https://site.financialmodelingprep.com/developer/docs/stable/search-stock-news), [Parse listing](https://parse.bot/marketplace/9b0e18a9-ca27-4387-b170-39b5e2066411/justetf-com-api).

## House view and AI boundaries

The outlook includes one dated, public UBS CIO headline sample when the supplied classifications contain technology exposure. It is labeled as a sample, with publication date and original URL. It is not the adviser bank's approved policy. Broader bank-house-view ingestion is still needed before claiming complete case-partner coverage.

With an OpenAI key, the Responses API chooses candidate IDs for the four sections using a strict structured schema. The server validates section membership, unknown/duplicate IDs and mandatory scope warnings. The model selects existing source-backed sentences; it cannot add amounts, dates, trades or causal claims. This is **AI-assisted prioritization**, not unrestricted generative financial advice. It has fixture tests but has not been live-tested with a paid model. Without a key, or on timeout/invalid output, the structured brief remains usable and is explicitly labeled.

Configured AI calls send compact briefing candidates containing customer-note excerpts, selected financial facts and public news to OpenAI (`store: false`). Uploaded files otherwise stay in browser memory, while public news and fund caches remain on the local server. The app excludes explicit name, birthday and account-ID fields and redacts account-number patterns in text. It does not claim comprehensive free-text anonymization.

## Import contract

Up to 25 MB / 1,000 customers:

1. A `clients.json`-shape array reuses the current reference universe. Unknown positions retain supplied names, ISINs and types; no reference classification is invented.
2. `{ "clients": [...], "reference": { "Securities": [...], ... } }` replaces the reference universe explicitly. Securities require unique numeric `Id` values. Optional risk profiles, allocation targets, raw `FundUnbundlingMappings` or prepared `FundBreakdowns` are supported. Known constituent snapshots are reused by ISIN independently of security IDs. Imported constituent URLs are not trusted or adopted.

For a position absent from reference, include `Isin` (or `SecurityIsin`) and `SecurityTypeName: "Investment fund"` to enable a fund lookup. Refresh restores the original dataset; in-session edits/imports are not persisted.

## Fund lookup and arithmetic

Dated snapshots are keyed by ISIN. The freshest saved issuer/public snapshot is preferred. Missing holdings are fetched in the background, four per queue. Optional FMP has a 3.5-second budget before the existing public justETF fallback (6.5 seconds); the browser has a 12-second timeout. Requests are deduplicated, failures briefly cached, and failed refreshes retain saved snapshots.

The justETF page adapter verifies canonical ISIN, date, constituent weights and published totals. Public-page layout changes, blocking and unsupported mutual funds can still make look-through unavailable. This is not a guaranteed market-data feed.

Top-ten weights are never scaled to 100%. Approximate indirect exposure is the selected-scope fund weight times the published constituent weight, with both dates available for inspection. Fund category dimensions are normalized separately. Portfolio-value changes are not cash-flow-adjusted investment returns. Recorded rule-engine findings are not newly recomputed breaches.

```sh
npm run warm:funds
npm run warm:funds -- --all
npm run prepare:data
```

## Verification and observed timing

34 tests pass, including all 104 customer/portfolio scopes, consolidated overlap, material old notes, new client/reference IDs, closed graph paths, direct/indirect identity joins, partial holdings, provider normalization, stale/unsafe news rejection, cache isolation and AI validation/fallback. Production build passes; the icon library emits a harmless `use client` directive warning in this client-only app.

Browser checks covered the four-part brief, live news, in-place fund expansion, shared Apple ownership paths, original-source evidence, zoom/fit, focused findings, news-to-graph links, CASE-038 scope switching, the larger CASE-037 network, and a synthetic client-plus-reference upload. No browser errors were observed in these checks.

Earlier, before the expanded news screening and chat UI, the synthetic upload rendered customer facts in 313 ms and completed its brief with live news in 1.2 s. This used existing fund snapshots and no AI key. API-plus-layout measurements for three unfamiliar-ID cases ranged from 82–692 ms with news refresh and 44–75 ms with the local news cache. These exclude browser rendering and cold fund-universe enrichment, and are observations on this machine rather than an SLA. Raw output: `test-results/briefing-benchmark.json`.

## Sentiment: the product decision

Do not lead the demo with a country-wide positive/negative score. Headline tone is not expected return; sector effects can conflict; duplicated stories distort averages; missing coverage can look like neutrality; and business domicile is not revenue exposure. Self-hosting a classifier does not solve those problems.

The current implementation prioritizes relevant events and shows the ownership path and source. A later sentiment feature should operate on deduplicated events for a named company/sector, preserve evidence and time horizon, distinguish reported tone from hypothesized impact, and show coverage/unknown status. Evaluate it against human labels before aggregating or using it to propose trades. Country aggregation should wait for an explicit exposure model. None of those unvalidated scores are presented as working functionality here.

## Adviser chat and portfolio workspace

The two main views are **Advisor chat** and **Portfolio workspace**. Chat automatically prepares a source-backed customer brief and supports questions about customer context, issues, liquidity, portfolio value, positions, exposures, individual entities and news. Without an AI key, an explicit intent router answers supported questions from deterministic record blocks; unsupported questions get an unavailable response. With `OPENAI_API_KEY`, `/api/advisor` uses the configured model to select verified blocks, including compound or conversational questions. The model cannot introduce new amounts or unsupported claims. Conversation state is isolated by customer and portfolio scope. No orders are executed.

The workspace contains Overview, Connection graph and Source records. Customer notes stay in chat, briefing and records; **notes are not graph nodes**.

- The attention panel groups supplied rule-engine records by rule, shows original comparison values and thresholds, and preserves the dated source evidence. Red means priority review, amber means check/reconfirm, and slate means a coverage gap. Exported findings are not newly recomputed breaches. A 20% combined company-security exposure is a labeled demonstration review heuristic, never a regulatory limit.
- Portfolio-history controls are 1D, 7D, 1M and 1Y, ending at the latest case observation. Exact start/end observations are required; unavailable daily/weekly changes are never interpolated from monthly data. All changes are portfolio-value movement, not cash-flow-adjusted investment returns. No holding-level performance attribution is claimed.
- Positions retain source weights and are sorted largest first. Industry combines direct classifications and fund category breakdowns without counting a fund twice. Company exposure combines direct equity and original top-ten constituent weights using exact ISINs; share classes remain separate and incomplete fund weights are not rescaled.
- Country exposure uses direct reference countries and country-specific fund categories. Broad fund regions remain a separate tab. Unknown country allocation stays unassigned; fund domicile and ISIN prefixes are never used as a proxy for investments' countries. All percentage denominators remain the entire selected portfolio.
- Each exposure has a News link. Public news is screened progressively in batches of 12 across **all covered companies and available industry/geography categories**, not only the six largest companies. Results are cached per query and publication window. News period controls refer to today and are independent of shifted portfolio-history dates. Up to two ranked headlines per exposure are returned, not a complete archive.
- Headline rules elevate affirmative distress or selected material-event wording, with explicit verification labels and affected exposure. Denials, hypothetical phrasing and recovery reports are suppressed. This is limited lexical triage, not verified bankruptcy detection or sentiment-based risk forecasting; company identity and event context require article review. Signals are never canceled out by positive aggregate value movement. The graph marks relevant company/news nodes; no synthetic bankruptcy news is inserted into the demo.

Validation includes all supplied customer/portfolio scopes, exposure reconciliation, missing-period behavior, compound chat questions, unsupported questions, graph closure with notes excluded, headline negation and invalid AI-selection fallback. Provider-backed generative selection still requires credentials to test live.
