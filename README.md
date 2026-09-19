# Compass — customer brief and financial network

A local UNRISKOMEGA prototype: import a customer, review priorities, performance, exposures and positions in one adviser workspace, then follow the evidence through an Obsidian-style financial network. A separate Live Call demo adds streaming transcription and sourced adviser suggestions.

## Live Call demo

The **Live Call** button opens an adviser-only copilot page. It streams only the adviser microphone to Deepgram at 16 kHz. ElevenLabs sends the simulated client's voice as raw PCM chunks for local playback; the already-known client text becomes its conversation turn directly, without transcribing the generated audio. For loudspeaker use, the adviser microphone is muted while voice is generated and played, then restored after a short echo-clearance pause. M3 reconciles client and substantive transcribed adviser turns against the selected case facts and suggests a short adviser answer with record sources. The latest answer, previous answers under **Earlier answers**, key portfolio facts, and distinct evidence cues stay available throughout the call. M3 also roleplays the client from an editable scenario. It opens the call, then waits for a substantive transcribed adviser response and 3.5 seconds of quiet before replying; thinking/holding remarks do not trigger an automatic reply. A manual client line is available to steer the demo. The call docks automatically on the right when started, leaving Compass usable while the conversation and suggestions update. **Expand call** returns to the full controls, and **Close call** ends the session.

Each new session writes a separate JSONL file to the gitignored `.local/live-call-logs/` directory, containing the selected case context, facts given to M3, finalized Deepgram segments and turns, generated or manual client lines, suggestion cards, and stream or playback errors. The small log ID is shown in the call status. The files remain on the local development machine for inspection after the call; raw audio and interim transcripts are not saved. The logs may contain client details, so handle or delete them as case data. Calls made before logging was added cannot be recovered.

Set `DEEPGRAM_API_KEY` and `ELEVENLABS_API_KEY` in the gitignored `.env.local`. The existing `AI_PROVIDER=azure` and `AZURE_OPENAI_DEPLOYMENT=FW-MiniMax-M3` configuration supplies both LLM roles; other configured AI providers also work. Start with `npm run dev`, open **Live Call**, choose the client and portfolio, and allow the browser microphone. Use Chrome and headphones. By default M3 opens as a client concerned about the selected portfolio and replies after each adviser turn; the manual controls remain available. Its roleplay context includes the selected client's profile, cash, positions, recorded performance and redacted notes. The page runs on localhost, which browsers treat as a secure context for microphone access. A second device requires an HTTPS deployment or trusted local HTTPS setup.

The client voice defaults to Rachel, with George and Adam selectable in the full call controls. Flash v2.5 remains the low-latency model; voice settings favor conversational variation without adding a second synthesis step. `ELEVENLABS_VOICE_ID` overrides the default choice. Readiness checks local configuration; a key with speech-only permission need not have ElevenLabs account-reading permission.

This is a synthetic demo using the selected case records. The suggested questions are for adviser review, with one record location shown on each card. The local brief and portfolio calculations provide the facts; M3 does not execute trades. ElevenLabs and Deepgram credentials remain on the server. Their usage may incur provider charges after free allowances; the page only calls ElevenLabs when a client line is spoken and only calls M3 for client replies and finalized client speech.

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

## Import client data: PDF statements

Use **Import client data** in the top bar to select one or more JSON files, or one text PDF. JSON files add their clients to the current workspace, retaining names and existing cases. You can select several `clients.json`-shape arrays together, optionally with a separate `reference.json`; the whole selection is validated before saving. A PDF opens a reconciliation preview; create a client from its named owner or select an existing client and confirm ownership. Confirmed PDFs append a separate **External** portfolio without replacing existing clients.

The PDF parser follows section headings across all pages, including continuation pages; it has no eight-page assumption. The supplied German custody-statement format is supported, with up to 25 MB per file. Scanned PDFs and other layouts fail with a useful error instead of guessing. Parsing uses PDF.js in the browser, with no OCR service, Docker container or LLM needed. The worker is loaded only when importing a PDF.

- Imports holdings, cash, portfolio metadata, net TWR, net flows, monetary profit, asset-class contributions and scoped allocation charts.
- Validates totals and weights before saving; incomplete pages and malformed position rows cannot silently produce partial portfolios.
- Invalid/conflicting ISINs retain reported values and source identifiers but are excluded from automatic identity matching.
- Saves the imported workspace and original PDF in this browser's IndexedDB, surviving reloads. The source drawer links to the original PDF page. This is local persistence, not cross-device/team synchronization. **Restore cases** clears those local imports.
- Duplicate files are detected by SHA-256. Newer reports for the same confirmed depot update its current snapshot and retain previous snapshots; older/same-date replacement attempts require review and are rejected.
- Briefing, chat and graph consume the external positions and reported performance. Equity-sector/region percentages remain explicitly equities-only. Historical return does not populate missing daily/weekly/monthly return series. Selected transactions remain in the original document, not a complete imported ledger.
- Mixed snapshots with incompatible dates or currencies withhold combined totals. An external portfolio's own currency and statement prices remain intact.

Validation: all ten provided PDFs (198 securities, 24 cash balances), extended continuation pages and an 11-page/40-position same-format test, duplicates, ownership conflicts, invalid identifiers, malformed rows, mixed dates/currencies, and briefing/chat evidence. Actual browser import and reload were checked. The example preview parsed in roughly 0.5 seconds locally; this excludes asynchronous news/fund enrichment.

## News and provider choices

The working no-key route uses OpenBB when configured, followed by public Yahoo Finance company-name search and Google News RSS fallback; industry and geography exposures use RSS. Requests run progressively in batches of twelve, with two batches in flight. Name searches require company mentions in the headline and never assign tickers or merge portfolio identities. Publication windows are 1, 7, 30 or 365 days, independently of case-history dates. Each search returns up to two ranked, dated headlines. Relevance and materiality use explicit lexical rules, not validated impact analysis; coverage is shown and this is not a complete market monitor.

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
| `AI_PROVIDER` | Set `codex`, `azure` or `fireworks`; otherwise the OpenAI Responses path is used |
| `AZURE_OPENAI_ENDPOINT` | Azure resource base URL; the adapter appends `/openai/v1` when needed |
| `AZURE_OPENAI_API_KEY` | Server-only Azure key |
| `AZURE_OPENAI_DEPLOYMENT` | Azure deployment name sent as the `model` value; default example is `gpt-5-mini` |
| `AZURE_OPENAI_API` | `responses` (default) for Azure OpenAI, or `chat` for compatible deployments including Fireworks |
| `AZURE_OPENAI_REASONING_EFFORT` | Optional model-supported effort; `minimal` for original GPT-5 mini, empty for provider defaults |
| `FIREWORKS_API_KEY` | Server-only Fireworks key |
| `FIREWORKS_BASE_URL` | Fireworks OpenAI-compatible API base; default `https://api.fireworks.ai/inference/v1` |
| `FIREWORKS_MODEL` | Fireworks model; default `accounts/fireworks/models/qwen3-8b` for fast structured selection |
| `FIREWORKS_REASONING_EFFORT` | Optional supported reasoning level; `none` disables thinking on Qwen3.8 Max for short selection calls |
| `CODEX_BIN` | Optional path to a current Codex executable; defaults to `codex` |
| `CODEX_MODEL` | Optional Codex model override |

Keys stay server-side; never use a `VITE_` prefix for secrets. Public news and the structured fallback work without an AI key; the Codex alternative uses an existing CLI login.

OpenBB provides a common API over underlying data providers; self-hosting it does not create new data entitlements. The local Docker service is installed and live-tested with the yfinance provider. The pinned connector accepts exact ISINs, so new company holdings can be resolved without guessing tickers from names. Explicit `OPENBB_SYMBOLS` overrides and FMP ISIN resolution remain available. Returned symbols and company mentions in titles/summaries are checked before linking stories; provider tags alone are insufficient. Requests go to `/news/company` relative to the configured API prefix. Failed or unavailable company providers fall back to Yahoo Finance name search, then RSS, and disclose the coverage limitation.

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

Live checks on 19 September 2026 returned company news for Apple, Microsoft and Nestlé by ISIN in approximately 0.8 seconds per request, and the Compass feed displayed OpenBB news for fund constituents. These are observed requests, not a coverage or latency guarantee. Holdings without security identifiers use Yahoo Finance name search, which can supply article thumbnails without a guessed ticker. Industry/country searches and unsupported company lookups continue through Google News RSS. Article thumbnails are preserved from Yahoo/OpenBB, FMP image fields and RSS media/enclosure/description images. The Docker build applies a small checked patch to the pinned Yahoo normalizer to retain its supplied thumbnail in OpenBB’s standard `images` field. No separate article scraping or image download is needed. Thumbnails load lazily from publisher URLs without a referrer; missing or broken images show a neutral placeholder. The feed labels the provider per article; refresh and client changes fetch news, not a streaming market subscription. Self-hosting does not unlock paid data feeds or perform sentiment analysis.

FMP uses `/stable/search-isin`, `/stable/etf/holdings` and `/stable/news/stock`. Fund results require matching fund symbols, consistent update dates and valid original weights. Live FMP access and market coverage are unverified until a key with endpoint access is supplied. The supplied reference already contains fund sector/region breakdowns, so this version does not add redundant calls to FMP's sector and country endpoints.

The teammate's Parse marketplace listing advertises ETF search/profile/prices/performance, but not constituent holdings. It is not wired into the holdings path.

Official references: [OpenBB company news](https://docs.openbb.co/odp/python/reference/news/company), [FMP holdings](https://site.financialmodelingprep.com/developer/docs/stable/holdings), [FMP ISIN search](https://site.financialmodelingprep.com/developer/docs/stable/search-isin), [FMP company news](https://site.financialmodelingprep.com/developer/docs/stable/search-stock-news), [Parse listing](https://parse.bot/marketplace/9b0e18a9-ca27-4387-b170-39b5e2066411/justetf-com-api).

For AI provider setup, see Microsoft's [Azure Responses API](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses) and [Fireworks models on Microsoft Foundry](https://learn.microsoft.com/en-us/azure/foundry/how-to/fireworks/enable-fireworks-models), plus Fireworks' [OpenAI-compatible API](https://docs.fireworks.ai/guides/querying-text-models). The tested Azure Fireworks route uses `AI_PROVIDER=azure`, `AZURE_OPENAI_API=chat`, a resource endpoint such as `https://RESOURCE.cognitiveservices.azure.com`, and the deployed model name (here `FW-MiniMax-M3`). Leave reasoning effort empty unless the model explicitly supports the requested setting. A direct Fireworks account uses `AI_PROVIDER=fireworks` and the supplied Fireworks model ID.

Run `npm run benchmark:llm` to compare streaming latency and tokens per second against existing Azure deployments. Configure the endpoint and server key in `.env.local`, or supply `AZURE_RESOURCE` and `AZURE_RESOURCE_GROUP` for an authenticated Azure CLI key lookup. Set `BENCHMARK_MODELS` to comma-separated deployment names and `BENCHMARK_RUNS` to 1–10 (default 3). The default output budget is 8192 tokens; override with `BENCHMARK_MAX_TOKENS`. This sends paid inference requests but provisions nothing. Results go to ignored `test-results/llm-benchmark.json`, including first visible text, completion time, finish reason and token accounting. Reported completion TPS can include hidden reasoning; visible TPS is withheld when the provider does not report reasoning token counts. Three runs are a local comparison, not an SLA or a model-quality evaluation. Original GPT-5 mini uses minimal effort; other deployments retain their defaults.

This project's current billing constraint is **Azure startup credits only**. Use Azure-billed eligible deployments, including Fireworks through Foundry; do not run direct Fireworks API benchmarks or select `AI_PROVIDER=fireworks` under this constraint. Microsoft documents credit coverage for [Fireworks through Foundry](https://learn.microsoft.com/en-us/startups/benefits/azure-credits/use-azure-credits#use-fireworks-models-on-foundry). A direct Fireworks key uses separate billing. Qwen offerings in the checked Azure catalog require provisioned throughput; no Qwen capacity has been reserved. Catalog membership alone does not establish deployability or inference access.

## House view and AI boundaries

Open **News & house views → House views & research → Import research**. Upload an array matching `public/research-template.json`: title, original source URL, publication date, summary, provenance and topics. Company topics require an ISIN; industry/country/region topics use exact exposure labels. Matching views join the brief, sources and graph. Unmatched views stay in the library. Research is kept in local browser storage and can be cleared. “Bank-approved” is an uploader declaration, never an approval independently verified by Compass. No hardcoded house view is injected.

Codex remains an alternative using an existing ChatGPT login. The Homebrew CLI's old MCP server rejected the configured current model; the bundled current runtime has removed MCP hosting. The adapter therefore uses **`codex exec`**, with an isolated temporary directory, user configuration disabled, read-only sandbox, shell tools disabled, ephemeral sessions and a JSON output schema. Set `AI_PROVIDER=codex`, `CODEX_BIN` to the current executable if needed, and `CODEX_MODEL` to an available model. This workspace was live-tested with the app's runtime and `gpt-5.6-luna`. Other machines need a compatible Codex install and login. No credential is exposed to the browser.

`OPENAI_API_KEY` enables Responses API structured selection. `AI_PROVIDER=azure` uses Azure's v1 Responses endpoint by default, or Chat Completions with `AZURE_OPENAI_API=chat`, and treats the deployment name as the model. `AI_PROVIDER=fireworks` uses the direct OpenAI-compatible Fireworks chat endpoint with structured JSON; `FIREWORKS_MODEL` selects its model. All routes choose from joined, evidence-backed briefing candidates and chat blocks. Server validation rejects unknown IDs, wrong sections, omitted value development and omitted scope safeguards. At most one news story plus one matched research view is selected. Calculations and identity joins remain deterministic. This is AI-assisted evidence prioritization, not an autonomous recommendation or trade engine. The sourced brief and local chat answer appear before the model responds and survive failure.

AI requests send customer-note excerpts, selected financial facts and public context to the configured provider. Responses API requests use `store: false`; local Codex uses ephemeral sessions (that is not a claim of zero provider retention). Client imports stay in browser memory; research is stored locally, and public fund/news caches stay on the local server. The app retains supplied FirstName, LastName and Company fields for client labels and displays initials or a company badge when no image is supplied. Case references remain secondary identifiers. Birthday and account-ID fields are excluded, and account-number patterns are redacted. It does not claim comprehensive free-text anonymization or production bank-data approval.

## Import contract

JSON imports have no fixed client-count limit. The browser must still have enough memory and local storage for the selected files. PDFs have a 25 MB per-file limit:

1. A `clients.json`-shape array adds its clients and reuses the current reference universe. Unknown positions retain supplied names, ISINs and types; no reference classification is invented.
2. `{ "clients": [...], "reference": { "Securities": [...], ... } }` or a separate `reference.json` merges shared lookup data by ID. Conflicting client IDs, client references, or lookup IDs are rejected; identical clients are skipped. Securities require unique numeric `Id` values. Optional risk profiles, allocation targets, raw `FundUnbundlingMappings` or prepared `FundBreakdowns` are supported. Known constituent snapshots are reused by ISIN independently of security IDs. Imported constituent URLs are not trusted or adopted.

For a position absent from reference, include `Isin` (or `SecurityIsin`) and `SecurityTypeName: "Investment fund"` to enable manual fund lookup. Automatic lookup requires a supplied equity classification; it does not assume every fund holds companies. Imports are saved in this browser; **Restore cases** clears them and returns to the original dataset.

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

42 tests pass, including all 104 client/portfolio scopes, cash-flow semantics, consolidation, same-ISIN aggregation, pension/execution-only mandates, asset-aware look-through, reference-date review, policy validation, research matching, partial news failures, source isolation and AI validation/fallback. Production build passes; the icon library emits a harmless `use client` directive warning.

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


### Terminal workspace revamp

The default graphite-and-amber layout follows client context → portfolio state → why it matters → next conversation. Three wealth-manager reviews, informed by the UnRiskOmega requirements and partner notes, shaped the hierarchy; client and composition facts precede subordinate review points. The compact four-part brief keeps complete leading bullets visible, with details and sources expandable. Portfolio state displays supplied asset composition, with original health findings retained in its details. Holdings and exposures follow, with a right-side image news feed and a floating assistant. No causal attribution or portfolio health score was added.

A persistent light/dark toggle applies to the workspace, graph, news, records, evidence and chat. Scope overlap remains next to the selector, and graphs/dialogs identify the current client. Review flags, linked exposure and observed value changes retain distinct meanings.

### Portfolio World view

Use **World** in the sticky top bar to open the client-specific globe and switch to **Connections** for the existing holdings graph. Country selection filters linked news. Headline evidence retains publisher, publication time and retrieval time; **Trace event to holdings** opens the corresponding graph neighborhood. The assistant receives the same sourced context. A collapsed hypothetical-move control computes covered company weight × assumed price move, with other prices and FX fixed.

The 1D / 7D / 1M / 1Y controls filter available dated news. They do not promise a complete historical news archive. Country mapping uses the existing reported country and fund allocation calculations. Broad regions, unknown allocations and cash remain outside the country map; a fund domicile is not treated as its underlying investment location. Current news does not explain shifted historical case values.

Optional World Monitor news backend:

```sh
npm run world:start
```

Requires Docker. The script checks out upstream commit `1ec0af6f33db2bc14d9339bd365dbf52846ccc7f` into ignored `.cache/worldmonitor`, generates local credentials, configures `.env.local`, and starts an independent four-container Compose project. The API binds only to `127.0.0.1:6901`; Redis REST binds to `127.0.0.1:8079`. OpenBB remains on port 6900. Restart Vite if it does not pick up the new environment automatically.

Compass packages World Monitor's API without its dashboard frontend: upstream's full dashboard build currently depends on a time-limited crawlable marketing snapshot. The API handlers are unchanged. The Docker packaging adds the configured AIS relay origin to the sidecar’s Docker-only private-fetch allowlist; the pinned upstream sidecar otherwise blocks its own relay. `deploy/worldmonitor/Dockerfile` retains the upstream runtime and license. World Monitor is AGPL-3.0-only; the pinned source and its license are retained in the local checkout. Compass calls the independent service over HTTP.

`/api/world-context` reads the global RSS digest, caches it for five minutes and returns normalized, dated articles. Matching to portfolio companies, countries and industry topics happens inside Compass. No customer names, notes, holdings or account identifiers are sent to World Monitor. Only explicit company-name and supported alias matches are used; article and portfolio geography remain separately labeled. Missing provider keys, failed feeds and stale upstream digests are visible in Coverage; no synthetic events are inserted. Shipping routes, sanctions and company-specific energy-disruption mappings are not inferred from positions or prices.

Provider keys live in ignored `.env.local` as `AISSTREAM_API_KEY`, `EIA_API_KEY`, and `NASA_FIRMS_API_KEY` (the FIRMS MAP_KEY). They are server-only. `npm run world:start` explicitly loads both the service’s `.env` and the app’s `.env.local` into Compose, then recreates services when credentials change. Never use a `VITE_` prefix for keys.

The World view consumes these providers through `/api/world-context`:

- **AISstream:** the World Monitor relay maintains the WebSocket connection. Compass reads up to 100 tanker positions received within 30 minutes. Reception times, incomplete coverage and startup classification delays are disclosed. A position does not establish a disruption or portfolio dependency.
- **EIA:** Compass’s server calls the [EIA v2 API](https://www.eia.gov/opendata/documentation.php) for daily WTI and Brent spot prices. Cards show USD/barrel, source calendar dates and changes from the previous published observation. Observations over 14 days old are marked stale in coverage.
- **NASA FIRMS:** Compass’s server calls the [FIRMS Area API](https://firms.modaps.eosdis.nasa.gov/api/area/) for NOAA-20 detections from today and yesterday UTC. It keeps nominal/high-confidence detections and displays the latest 300, with the sample limit in coverage. Thermal anomalies are not necessarily wildfires; acquisition times and coordinates are preserved.

Direct EIA/FIRMS reads avoid relying on cache seeders absent from this local API-only stack; those layers also work without World Monitor. Requests share the world digest’s five-minute cache (30 seconds when news is unavailable). Failures are isolated; raw errors containing credential-bearing URLs are never returned to the browser. Use **World → Global** for fire and tanker signals without a supported portfolio match, and **Sources & coverage** for provider status.

```sh
# Service health / stop without deleting its cache
curl http://127.0.0.1:6901/api/sidecar-health
docker compose -f .cache/worldmonitor/docker-compose.yml -f deploy/worldmonitor/compose.override.yml -p compass-worldmonitor stop
```

Map geometry is Natural Earth public-domain data distributed through `world-atlas` (ISC). `public/geo/countries.json` is a low-resolution country boundary asset, not a statement of territorial policy.
Regenerate the bundled map with `npm run prepare:map` after changing the map data dependency.

### Instrument quotes and metadata fidelity

Both Cockpit and Brief show **Latest instrument prices** for the selected scope. `/api/instrument-quotes` accepts up to 20 `{isin,name,type}` instruments plus optional `refresh`. It validates ISIN syntax/check digit, performs an exact-ISIN Yahoo Finance search with fuzzy matching disabled, accepts only a single compatible listing, and verifies the returned chart symbol/type, positive price, currency and source observation time. A provider search result is resolution evidence, not an independently audited issuer registry. Ambiguous, invalid, unsupported and missing results remain unavailable. No ticker is guessed from a company name.

Prices are latest available observations, not a guaranteed real-time stream. Exchange quotes can be delayed or from the last market close; mutual funds return published NAVs when covered. The UI shows the provider-selected symbol, exchange, currency, current provider name and UTC observation time. Currency is not assumed to equal the imported holding's currency; GBp remains pence. Prices older than four days (exchange) or seven days (NAV) are marked stale. No quote overwrites an imported price or revalues portfolio history/exposure. Client changes cancel and hide previous-scope results.

The quote cache lasts one minute (30 seconds for unavailable results); successful listing resolution is cached for one day. Manual refresh bypasses both. Retrieval is server-side, four requests at a time per batch, without client identities or values sent upstream. No additional API key or OpenBB equity extension is required. OpenBB remains the optional company-news service.

When Yahoo cannot resolve a US equity ISIN, an [OpenFIGI exact-ISIN mapping](https://www.openfigi.com/api/documentation) is attempted for the US common-stock composite. Only one compatible ticker/share-class mapping is accepted; exchange suffixes are not invented. The fallback is limited to 20 requests/minute per resolver without a key, below the documented public mapping allowance. This repairs the observed Alphabet ISIN search gap; the returned GOOGL quote still comes from Yahoo and is checked against that resolved symbol. Other unavailable identities remain explicit gaps.

The prepared/reference-import pipeline retains country, industry, region and separate SAA classifications. Exact-ISIN constituent/master joins attach classifications with provenance, withholding conflicts. Direct regions and partial constituent countries now participate in exposure calculations; broad and country-specific buckets stay distinct. Existing saved workspaces recover missing fields only from matching source identities. PDF imports retain the same fields when their reference identity is accepted. Unknown metadata remains unknown.

News targets carry these classifications; World exposes them with evidence. Country/region/sector weights overlap and are never added by the cockpit. Computed sector/geographic policy drift is withheld unless classification and denominator are demonstrably comparable; fund product labels are not substituted for underlying policy allocations. Older fund snapshots are checked automatically and refresh failures retain dated data with a warning. Explicit World refresh bypasses Compass's five-minute cache, while upstream source caching may remain.

Verification on 19 September 2026 included live ISIN lookup/quotes for Apple, Nestlé, Alphabet through OpenFIGI, two ETFs and five Swiss fund NAVs. The Joker browser scope returned 13 available prices out of 15 instruments at check time. Coverage varies by instrument/provider and is not a promise that every fund or private security has a public quote. The case data contains one non-ISIN identifier (`A1ACARWASH01`), which is excluded from price lookup.

For a complete Azure MiniMax M3 input replay with measured extraction and news-identity checks, run `npm run reingest:minimax`. See [MINIMAX-INGESTION.md](MINIMAX-INGESTION.md) for scope, source coverage, resume behavior and local quality-report artifacts. Model output is kept separate from authoritative records.

## News & Client Impact

The new top-level tab scans the loaded client book using a rolling seven-day publication window. It reuses the existing **Import client data** flow: uploaded clients and reference records invalidate the local exposure index, trigger fresh searches when this tab is active (or next opened), and retain links to their own position/portfolio evidence. Public search queries are deduplicated across clients; client identities, amounts and notes are not sent to the news classifier.

MiniMax classifies public source text through the existing Azure endpoint/key; `OUTREACH_MODEL` defaults to `FW-MiniMax-M3`, independently of the briefing model. Exact source quotes and allowed entity IDs are checked. Classification is cached by source content, model and schema version. Unsupported or failed output uses labeled conservative rules.

Urgency is deterministic per client/development: connection 0–3, event significance 0–3, materiality 0–2 (3% and 10% thresholds), and evidenced timing 0–2. Eligible results range from 1–10; the default filter is 7+. Category-only matches and fallback classifications are capped at 6; speculative/denied/unclear reports and older events without a current timed trigger are capped at 3. Scores describe outreach priority, not expected loss. Unknown weights earn no materiality points. Incompatible portfolio scopes are evaluated separately, and only the strongest supported connection is shown per client.

Source coverage remains bounded by existing adapters (up to two headlines per exposure and 500 world-digest articles); missing feeds and incomplete fund look-through remain visible. Contacted/dismissed status persists locally in this browser. Conversation starters are editable drafts; nothing is sent.

Validation includes newly imported JSON clients and security references, evidence ownership, seven-day boundaries, false issuer matches, scoring/time decay, old reports, duplicates, isolated global observations, classifier validation/cache and fallback.
