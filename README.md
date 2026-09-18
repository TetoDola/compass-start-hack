# Compass — customer brief and financial network

A local UNRISKOMEGA prototype: import a customer, review priorities, performance, exposures and positions in one adviser workspace, then follow the evidence through an Obsidian-style financial network. Realtime transcription remains deferred.

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
npm run benchmark:brief -- --cold-funds  # dev server on port 5173; refreshes live providers
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

The working no-key route uses public Google News RSS searches across covered company, industry and geography exposures, progressively in batches of twelve, with two batches in flight. Publication windows are 1, 7, 30 or 365 days, independently of case-history dates. Each search returns up to two ranked, dated headlines. Relevance and materiality use explicit lexical rules, not validated impact analysis; coverage is shown and this is not a complete market monitor.

Only public company identifiers/names and exposure category names are sent to news providers. Customer names, notes, portfolio amounts and account identifiers are not included in news queries. News relevance is inferred; even an exact security match does not prove a headline caused any price movement. Case export dates are shifted and are never aligned to live news as if they shared a historical timeline.

Optional provider configuration lives in `.env.local` (copy `.env.example` and restart the server):

| Variable | Purpose |
| --- | --- |
| `FMP_API_KEY` | Exact ISIN-to-ticker resolution, ETF/fund holdings, and company news |
| `OPENBB_BASE_URL` | Existing OpenBB API prefix, e.g. `http://127.0.0.1:6900/api/v1` |
| `OPENBB_NEWS_PROVIDER` | Underlying provider, default `yfinance` |
| `OPENBB_SYMBOLS` | Optional ISIN-to-ticker overrides; bundled yfinance accepts ISINs directly |
| `OPENAI_API_KEY` | Enable AI selection of evidence-backed briefing and chat answer blocks |
| `OPENAI_MODEL` | Model for Responses API selection; default `gpt-5-mini` |
| `AI_PROVIDER` | Set `codex` to use your local Codex login instead of an API key |
| `CODEX_BIN` | Optional path to a current Codex executable; defaults to `codex` |
| `CODEX_MODEL` | Optional Codex model override |

Keys stay server-side; never use a `VITE_` prefix for secrets. No provider keys are required for the configured local Codex + public-news demo.

OpenBB provides a common API over underlying data providers; self-hosting it does not create new data entitlements. The local Docker service is installed and live-tested with the yfinance provider. The pinned connector accepts exact ISINs, so new company holdings can be resolved without guessing tickers from names. Explicit `OPENBB_SYMBOLS` overrides and FMP ISIN resolution remain available. Returned symbols and company mentions in titles/summaries are checked before linking stories; provider tags alone are insufficient. Requests go to `/news/company` relative to the configured API prefix. Failed or unavailable providers fall back to RSS and disclose the coverage limitation.

### Local OpenBB with Docker

```sh
docker compose up -d --build
# .env.local:
# OPENBB_BASE_URL=http://127.0.0.1:6900/api/v1
# OPENBB_NEWS_PROVIDER=yfinance
# Restart the Compass dev server after changing environment settings.
docker compose ps
# To stop it later: docker compose stop openbb
```

The container exposes only `127.0.0.1:6900`; it runs as a non-root user without host folders, credentials or customer files mounted. The image installs pinned OpenBB core, news, Yahoo Finance and API packages from PyPI, and a health check verifies the API. It uses the official [OpenBB API/Docker approach](https://docs.openbb.co/odp/python/installation) with only the extensions this app needs. API documentation: `http://127.0.0.1:6900/docs`.

Live checks on 19 September 2026 returned company news for Apple, Microsoft and Nestlé by ISIN in approximately 0.8 seconds per request, and the Compass feed displayed OpenBB news for fund constituents. These are observed requests, not a coverage or latency guarantee. Industry/country searches and unsupported company lookups continue through Google News RSS. Article thumbnails are preserved from Yahoo/OpenBB, FMP image fields and RSS media/enclosure/description images. The Docker build applies a small checked patch to the pinned Yahoo normalizer to retain its supplied thumbnail in OpenBB’s standard `images` field. No separate article scraping or image download is needed. Thumbnails load lazily from publisher URLs without a referrer; missing or broken images show a neutral placeholder. The feed labels the provider per article; refresh and client changes fetch news, not a streaming market subscription. Self-hosting does not unlock paid data feeds or perform sentiment analysis.

FMP uses `/stable/search-isin`, `/stable/etf/holdings` and `/stable/news/stock`. Fund results require matching fund symbols, consistent update dates and valid original weights. Live FMP access and market coverage are unverified until a key with endpoint access is supplied. The supplied reference already contains fund sector/region breakdowns, so this version does not add redundant calls to FMP's sector and country endpoints.

The teammate's Parse marketplace listing advertises ETF search/profile/prices/performance, but not constituent holdings. It is not wired into the holdings path.

Official references: [OpenBB company news](https://docs.openbb.co/odp/python/reference/news/company), [FMP holdings](https://site.financialmodelingprep.com/developer/docs/stable/holdings), [FMP ISIN search](https://site.financialmodelingprep.com/developer/docs/stable/search-isin), [FMP company news](https://site.financialmodelingprep.com/developer/docs/stable/search-stock-news), [Parse listing](https://parse.bot/marketplace/9b0e18a9-ca27-4387-b170-39b5e2066411/justetf-com-api).

## House view and AI boundaries

Open **News & house views → House views & research → Import research**. Upload an array matching `public/research-template.json`: title, original source URL, publication date, summary, provenance and topics. Company topics require an ISIN; industry/country/region topics use exact exposure labels. Matching views join the brief, sources and graph. Unmatched views stay in the library. Research is kept in local browser storage and can be cleared. “Bank-approved” is an uploader declaration, never an approval independently verified by Compass. No hardcoded house view is injected.

The current local demo uses Codex with its existing ChatGPT login. The Homebrew CLI's old MCP server rejected the configured current model; the bundled current runtime has removed MCP hosting. The adapter therefore uses **`codex exec`**, with an isolated temporary directory, user configuration disabled, read-only sandbox, shell tools disabled, ephemeral sessions and a JSON output schema. Set `AI_PROVIDER=codex`, `CODEX_BIN` to the current executable if needed, and `CODEX_MODEL` to an available model. This workspace was live-tested with the app's runtime and `gpt-5.6-luna`. Other machines need a compatible Codex install and login. No credential is exposed to the browser.

Alternatively, `OPENAI_API_KEY` enables Responses API structured selection. Both routes choose from joined, evidence-backed briefing candidates and chat blocks. Server validation rejects unknown IDs, wrong sections, omitted value development and omitted scope safeguards. At most one news story plus one matched research view is selected. Calculations and identity joins remain deterministic. This is AI-assisted evidence prioritization, not an autonomous recommendation or trade engine. The sourced brief and local chat answer appear before the model responds and survive failure.

AI requests send customer-note excerpts, selected financial facts and public context to the configured OpenAI service. Responses API uses `store: false`; local Codex uses ephemeral sessions (that is not a claim of zero provider retention). Client imports stay in browser memory; research is stored locally, and public fund/news caches stay on the local server. The app removes explicit name, birthday and account-ID fields and redacts account-number patterns. It does not claim comprehensive free-text anonymization or production bank-data approval.

## Import contract

Up to 25 MB / 1,000 customers:

1. A `clients.json`-shape array reuses the current reference universe. Unknown positions retain supplied names, ISINs and types; no reference classification is invented.
2. `{ "clients": [...], "reference": { "Securities": [...], ... } }` replaces the reference universe explicitly. Securities require unique numeric `Id` values. Optional risk profiles, allocation targets, raw `FundUnbundlingMappings` or prepared `FundBreakdowns` are supported. Known constituent snapshots are reused by ISIN independently of security IDs. Imported constituent URLs are not trusted or adopted.

For a position absent from reference, include `Isin` (or `SecurityIsin`) and `SecurityTypeName: "Investment fund"` to enable manual fund lookup. Automatic lookup requires a supplied equity classification; it does not assume every fund holds companies. Refresh restores the original dataset; in-session edits/imports are not persisted.

## Fund lookup and arithmetic

Dated snapshots are keyed by ISIN. The freshest saved issuer/public snapshot is preferred. Missing equity-fund holdings are fetched in the background, four per queue. Commodity, property and bond funds use an explicitly different risk lens. Optional FMP has a 3.5-second budget before the existing public justETF fallback (6.5 seconds); the browser has a 12-second timeout. Requests are deduplicated, failures briefly cached, and failed refreshes retain saved snapshots.

The justETF page adapter verifies canonical ISIN, date, constituent weights and published totals. Public-page layout changes, blocking and unsupported mutual funds can still make look-through unavailable. This is not a guaranteed market-data feed.

Top-ten weights are never scaled to 100%. Approximate indirect exposure is the selected-scope fund weight times the published constituent weight, with both dates available for inspection. Fund category dimensions are normalized separately. Portfolio-value changes are not cash-flow-adjusted investment returns. Recorded rule-engine findings are not newly recomputed breaches.

```sh
npm run warm:funds
npm run warm:funds -- --all
npm run prepare:data
```

## Verification and observed timing

41 tests pass, including all 104 client/portfolio scopes, cash-flow semantics, consolidation, same-ISIN aggregation, pension/execution-only mandates, asset-aware look-through, reference-date review, policy validation, research matching, partial news failures, source isolation and AI validation/fallback. Production build passes; the icon library emits a harmless `use client` directive warning.

Browser checks on the updated workspace covered the complete brief, the focused two-account gold path and its evidence, live Codex question answering, research-file ingestion and matched public-research text in the brief, daily-data unavailability, an imported client with new client/portfolio identifiers, and restoration of the original cases. The synthetic research was cleared afterward. A tall sticky sidebar discovered during testing was removed so the chat composer remains reachable.

On 19 September 2026, `npm run benchmark:brief -- --cold-funds` measured renamed CASE-005, CASE-012 and CASE-038 imports. Initial deterministic facts took **4–19 ms**. Full fund-refresh, all-batch news and live Codex selection took **6.75 s, 7.19 s and 8.53 s**, respectively. Fund snapshots were removed in benchmark memory and provider refresh was requested; original files were retained. The runs completed 32/32, 42/42 and 82/82 news searches. Missing mutual-fund snapshots remained missing. These measurements include successful and unavailable lookups, not guaranteed full look-through. Reference data was already loaded, browser rendering is excluded, and the measurements are not an SLA. Details and baseline/model selections: `test-results/briefing-benchmark.json` (locally generated, ignored by Git).

The model preserved the audited deterministic financial narrative and selected a relevant outlook item. In the live tax-question check it moved liquidity and mandate blocks ahead of generic risk actions. This is a demonstrated selection benefit, not a controlled quality score or proof of superior investment advice.

See `DEMO-RUNBOOK.md` for the resettable demonstration, four-slide pitch outline and explicit integration boundary. `/uro-entry-demo.html` demonstrates a client-context entry using all supplied clients; it is visibly labeled as a simulation, with no real URO connection.

## Sentiment: the product decision

Do not lead the demo with a country-wide positive/negative score. Headline tone is not expected return; sector effects can conflict; duplicated stories distort averages; missing coverage can look like neutrality; and business domicile is not revenue exposure. Self-hosting a classifier does not solve those problems.

The current implementation prioritizes relevant events and shows the ownership path and source. A later sentiment feature should operate on deduplicated events for a named company/sector, preserve evidence and time horizon, distinguish reported tone from hypothesized impact, and show coverage/unknown status. Evaluate it against human labels before aggregating or using it to propose trades. Country aggregation should wait for an explicit exposure model. None of those unvalidated scores are presented as working functionality here.

## One adviser workspace

The main screen combines a compact client/scope header, visible four-part brief and mandate, priority findings, portfolio value movement, exposures, positions, relevant news, customer context and a right-hand news feed with suggested questions. **Ask Compass** opens as a bottom-right support-style chat panel; minimizing preserves the conversation and draft, while client/scope changes reset them. Suggested questions open as editable drafts. Findings expand in place. The assistant starts with three suggested questions and supports questions about customer context, issues, liquidity, portfolio value, positions, exposures, individual entities and news. Without an AI key, an explicit intent router answers supported questions from deterministic record blocks; unsupported questions get an unavailable response. With local Codex or `OPENAI_API_KEY`, `/api/advisor` uses the configured model to select verified blocks, including compound or conversational questions. The model cannot introduce new amounts or unsupported claims. Conversation state is isolated by customer and portfolio scope. No orders are executed.

Connections, source records and exposure-specific news open in dialogs over the overview. Evidence returns to the originating dialog, preserving its search and expansion state. Customer notes stay in the conversation brief, assistant and records; **notes are not graph nodes**.

- The attention panel groups related supplied rule-engine records into decision themes, shows original comparison values and thresholds, and preserves the dated source evidence. Red means priority review, amber means check/reconfirm, and slate means a coverage gap. Exported findings are not newly recomputed breaches. A 20% combined product or covered company-security exposure is a labeled demonstration review heuristic, never a regulatory limit.
- Portfolio-history controls are 1D, 7D, 1M and 1Y, ending at the latest case observation. Exact start/end observations are required; unavailable daily/weekly changes are never interpolated from monthly data. All changes are portfolio-value movement, not cash-flow-adjusted investment returns. No holding-level performance attribution is claimed.
- Investments aggregate identical verified ISINs across non-overlapping accounts and retain every position source. Cross-currency values are not summed. Industry combines direct classifications and fund category breakdowns without counting a fund twice. Company exposure combines direct equity and original top-ten equity-fund constituent weights using exact ISINs; share classes remain separate and incomplete fund weights are not rescaled.
- Country exposure uses direct reference countries and country-specific fund categories. Broad fund regions remain a separate tab. Unknown country allocation stays unassigned; fund domicile and ISIN prefixes are never used as a proxy for investments' countries. All percentage denominators remain the entire selected portfolio.
- Each exposure has a News link. Public news is screened progressively in batches of 12 across **all covered companies and available industry/geography categories**, not only the six largest companies. Results are cached per query and publication window. News period controls refer to today and are independent of shifted portfolio-history dates. Up to two ranked headlines per exposure are returned, not a complete archive.
- Headline rules elevate affirmative distress or selected material-event wording, with explicit verification labels and affected exposure. Denials, hypothetical phrasing and recovery reports are suppressed. This is limited lexical triage, not verified bankruptcy detection or sentiment-based risk forecasting; company identity and event context require article review. Signals are never canceled out by positive aggregate value movement. The graph marks relevant company/news nodes; no synthetic bankruptcy news is inserted into the demo.

Validation includes all supplied customer/portfolio scopes, exposure reconciliation, missing-period behavior, compound chat questions, unsupported questions, graph closure with notes excluded, headline negation and invalid AI-selection fallback. Live local Codex and Docker OpenBB/yfinance news are verified. FMP still needs an API key to validate live access.
