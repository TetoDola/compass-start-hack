# Combined hackathon and wealth manager audit

Reviewed 19 September 2026. Consolidates the hackathon-requirements audit and the critical wealth-manager review of the current Compass implementation. The findings below preserve the pre-fix assessment. The implementation status immediately below supersedes its descriptions of missing functionality.

## Implementation update — 19 September 2026

| Finding | Implemented response | Remaining boundary |
| --- | --- | --- |
| Mandate and reliability | Pension/execution-only framing, dated profile and instructions, liquidity qualification, reference-age review | Objectives and withdrawal eligibility still need confirmation |
| Complete briefing | Visible four-part brief, refresh, sources and export | No unsupported investment-return attribution |
| Decision priorities | Related rule families, original thresholds, aggregated holdings and freshness | Review triggers are not new suitability limits |
| Asset-aware exposure | Exact-ISIN aggregation; equity, commodity, property and bond distinctions | Public mutual-fund coverage remains incomplete |
| Value movement | “Value change · not return” beside headline; exact period endpoints | Cash-flow and position-price inputs needed for real returns |
| Next steps and policy | Conditional actions, cash need versus reported balance, actual/target/band/deviation table where valid | No invented policy for zero-target or incompatible allocations |
| News and research | Live Docker OpenBB/yfinance company news with ISIN resolution, RSS topic/fallback news, stricter matches, company/exposure relevance and dated research JSON import | Headline relevance needs verification; bank approval is uploader-declared |
| Grounded AI | Live local Codex selection for brief and chat; validated IDs and immediate fallback | Uses current `codex exec`, because current runtime removed MCP hosting; no autonomous trading |
| Adviser layout | Right-side news and questions; bottom-right chat preserves conversation when minimized and resets for another client | News updates on refresh, not streaming |
| Focused graph | Review item opens its ownership neighborhood and combined evidence | Connection count remains a visual property, not risk |
| Demo proof | New-ID UI import, cold-fund refresh benchmark, simulated client-context entry and pitch runbook | Real URO integration and unseen jury files require partner access |

**Verification:** 41 tests and production build pass. UI checks cover live Codex chat, research import and matching, focused gold exposure, daily-data gaps, new client/portfolio IDs and restoring the original dataset. Three benchmark runs with fund snapshots removed in memory completed the enriched brief in 6.75–8.53 seconds; initial facts took 4–19 ms. Browser rendering is excluded and unsupported fund look-through remained unknown. Details: README and `test-results/briefing-benchmark.json`.

The old verdict and individual findings below are historical rationale, not a claim that these fixes are still absent. True return attribution, complete licensed data and a real URO connection cannot be established from the available export alone.

## Verdict

Compass is a working, evidence-linked portfolio exploration prototype. It does not yet consistently deliver the case partner's main outcome: preparing an adviser for a client conversation with one concise, client-specific story and practical next actions.

Both audits identify the same underlying gap: the adviser still has to connect the client context, portfolio facts, relevant developments and possible responses manually. The next iteration should improve that reasoning and its presentation within the existing single workspace.

## Requirements and judging

The official presentation, slides 9–12, asks for a one-click briefing within the advisory workflow, combining client/portfolio data, external news and a CIO/house view. It should take roughly one minute to read and cover development, portfolio health, outlook and concrete next-best actions. The 60 seconds is a reading goal, not a demonstrated generation SLA. The approximately ten-second generation ambition comes from the partner-discussion notes.

| Official criterion | Weight | Combined assessment |
| --- | ---: | --- |
| Problem fit and business value | 25% | Partial: useful records and analytics, but insufficient synthesis and actionable preparation. |
| Implementation quality and robustness | 25% | Strongest area: working imports, evidence, scope controls and fallbacks; current full cold-start latency and unfamiliar live files still need validation. |
| AI relevance and grounding | 20% | Incomplete: safeguards exist, but no AI key was configured at audit time; optional AI selects predefined blocks rather than composing a connected explanation. |
| User experience | 15% | Cleaner layout, but no prominent complete one-minute briefing or demonstrated URO entry flow. |
| Bonus features | 15% | Graph and follow-up questions work. Ex-custody PDF import is absent and optional. |

These are qualitative assessments, not predicted jury scores. The public-vote round is based on the team's description of the event; the case deck supplies the weighted partner rubric above.

## Merged findings and acceptance criteria

P1 means a core submission or adviser-trust gap. P2 means an important improvement to usefulness or demonstration quality. The order below reflects dependencies as well as impact.

### P1 — Establish mandate, client needs and data reliability before interpretation

The overview exposes a profile code and selected note, but gives insufficient prominence to service type, objectives, liquidity constraints and valuation freshness. A pension-product portfolio and an execution-only account need different conversation framing. Reported liquidity does not establish withdrawal availability. Missing objectives or strategy prevent a supported judgment that an allocation is inappropriate.

**Acceptance:** show service/mandate, selected scope, material customer instructions and known objectives or explicit gaps. Surface materially old reference-price dates and distinguish them from verified current valuation dates. Keep reported liquidity separate from confirmed available cash. Do not turn profile codes into invented client characteristics or treat a dated note as a current instruction without reconfirmation.

### P1 — Restore the complete briefing as the primary outcome

The layout revamp removed the automatic visible briefing. The four-part selection engine remains and is used by the export, but the screen distributes information across panels and starts the compact assistant empty. The adviser still constructs the story.

**Acceptance:** an obvious briefing trigger produces a short overview in the existing workspace covering what changed, what matters, relevant outlook and next actions. Each material claim has evidence, dates and applicable limitations. A person unfamiliar with the case can read it in about one minute and explain the main client issue and next step. Four headings and a 130–170-word budget are design options, not formal requirements.

### P1 — Prioritize decisions rather than repeat alerts and coverage warnings

Current prioritization mainly orders exported rule groups, a company-concentration heuristic, a cash-note check and coverage gaps. It misses material information already available, including repeated fund holdings and old reference-price dates. Related rule records remain separate review themes, while generic data gaps can dominate a quiet portfolio.

**Acceptance:** lead with a few evidence-backed decision themes. Group related records while preserving their original thresholds and sources. Consider client needs, applicable mandate, materiality, recency and unresolved status. Keep urgent reliability problems prominent, but do not describe every missing constituent list as a portfolio problem. A concentration is a review finding, not automatically a suitability breach.

### P1 — Make exposure analysis aware of the investment type

The same fund can appear in several accounts without its combined product exposure becoming a priority. The missing-company-holdings check treats all funds alike. Gold or silver vehicles, equity funds, property funds and certificates do not have identical underlying risks or applicable breakdowns.

**Acceptance:** retain position-level records and add verified aggregate product exposure across non-overlapping accounts. Distinguish not-applicable, unavailable and partial look-through. Keep physical commodity exposure distinct from mining equities, instrument concentration distinct from issuer risk, and country classification distinct from revenue or currency exposure. Preserve original top-ten weights and unknown remainders; never infer missing exposure as zero.

### P1 — Separate observed value movement from investment performance

The arithmetic is correctly labelled in supporting text, but a large red or green percentage can still be repeated as an investment gain or loss. Cash-flow-adjusted returns, benchmarks and holding-level performance drivers are not established. Current news cannot explain shifted historical observations.

**Acceptance:** attach “Portfolio value change — includes cash flows” directly to the headline number and show its endpoints. Keep unsupported daily/weekly results unavailable. Explain drivers only when matching holdings, prices and cash-flow evidence supports them. Obtaining suitable data is a dependency for true return attribution; wording or an LLM cannot replace it.

### P1 — Produce specific, conditional next actions

“Review the limit” and “confirm objectives” are reasonable checks but insufficient as the main output. The app does not consistently connect a customer need to the relevant holdings, mandate, allocation or preparation task. Supplied targets are inspectable, but meaningful actual-versus-target interpretation is limited.

**Acceptance:** each proposed discussion option names the relevant exposure or need, explains why it matters, cites the supporting facts and states the checks required before proceeding. Where comparable policy data exists, show actual allocation, target/range and deviation using compatible taxonomies. Where policy or valuation is unresolved, provide a concrete preparation step. No automatic trade execution is required.

### P1 — Improve news relevance and provide a general house-view route

Headline keyword matching sometimes promotes stories without an evident material link to the client. The CIO component is one dated, hardcoded public research sample matched to technology exposure. Neither source selection nor the current briefing establishes a client-specific outlook across arbitrary cases.

**Acceptance:** promoted news identifies the affected investment or supported exposure, its weight, the event, and why it deserves attention. Preserve the distinction between verified event, inferred relevance and possible impact. Support ingestion of dated house-view material and match its substantive views to exposures; visibly distinguish public samples from bank-approved research. Missing relevant outlook stays explicit. Do not add sentiment averages or causal claims to fill the gap.

### P1 — Demonstrate useful grounded AI, not just an API connection

At audit time the application operates through deterministic local answers. The optional model chooses existing candidate IDs. This limits hallucinations but does not yet establish that AI helps connect evidence or produce better preparation.

**Acceptance:** demonstrate a live, source-backed briefing that combines client context, portfolio facts and relevant external context into useful prose. Keep arithmetic and identity resolution deterministic, preserve claim validation and fallback, and test conflicting notes, unsupported questions and missing sources. Compare the result with the deterministic baseline. Existing AI selection can remain if it delivers the required outcome; unconstrained generation is unnecessary.

### P2 — Make the graph explain the selected decision

The graph already supports useful exploration, fund expansion and source inspection. Its value is weaker when it opens as a generic network. Connection count is not portfolio size or financial risk.

**Acceptance:** a briefing finding opens a focused path that explains it, such as the same fund in two portfolios or direct and indirect exposure to one verified security. Show applicable weights, sources and coverage in the explanation. Preserve a readable overview, keep notes out of the graph, and keep text sufficient for advisers who do not open it.

### P1 — Prove the complete unfamiliar-client workflow

Same-shape JSON import, generalized calculations and tests are meaningful strengths. Earlier timings do not establish current full JSON-to-brief latency with expanded news screening, cold fund lookups and live AI. Actual URO integration is not present; a standalone screen needs a credible integration story.

**Acceptance:** rehearse import → useful initial facts → completed briefing → evidence → focused graph → next action on unfamiliar client data, with no code changes. Measure initial usability and complete enrichment separately. Repeat with missing references, unavailable providers and overlapping portfolios. Preserve useful partial output. Demonstrate an intended client-context entry point, distinguishing simulated integration from real integration. Prepare a resettable demo and a short deck consistent with what works.

## Concrete cases that should drive validation

| Case | Verified observation | Required behaviour |
| --- | --- | --- |
| CASE-005 | CHF 479,594.78 reported assets and CHF 124,192.59 reported liquidity; both portfolios labelled `Vorsorgeprodukte` (pension products). | Put the product/mandate context beside liquidity; do not assume ordinary withdrawal availability. |
| CASE-005 | Gold fund ISIN CH0352765397 occurs in both portfolios: approximately CHF 98,168.93 and 20.47% combined. The largest individual position is approximately 17.8%. | Show the combined product exposure without calling the correct position-level figure an arithmetic error or labelling concentration a proven breach. |
| CASE-005 | Three positions, approximately 16.30% of assets, have reference-price dates in April 2024; the portfolio snapshot is September 2026. | Request valuation verification. These dates flag a reliability concern; they do not independently prove the supplied position values are wrong. |
| CASE-005 | The only initial attention item during review was “11 funds without company holdings.” | Surface the more useful client and valuation questions; distinguish company look-through applicability and count unique funds versus positions accurately. |
| CASE-005 | A dated note requests a call before standing-order changes. | Carry that instruction into the preparation agenda and reconfirm it. |
| CASE-012 | A March note records an approximately CHF 15,000 Q1 tax need, alongside CHF 328.18 reported liquidity. | Connect the facts as a question to resolve; do not declare an outstanding shortfall or invent a sale amount. |
| CASE-012 | Nineteen review themes were displayed, several concerning related concentration/allocation matters. | Summarize the decisions while retaining all original records underneath. |
| CASE-028 | Approximately 95.9% in VZ Holding; the portfolio service is Execution only. | Explain concentration while keeping the service boundary visible and avoiding an automatic rebalancing recommendation. |
| CASE-038 | Consolidated and ordinary portfolios may overlap. | Retain the existing safeguard withholding combined totals until scope is resolved. |

## Strengths to preserve

- Correct source joins, inspectable evidence, dated notes and explicit treatment of exported findings as recorded outputs.
- Consolidation safeguards, partial-coverage disclosures, original top-ten weights and refusal to invent daily/weekly performance.
- Working client and reference imports, local fallbacks, interactive graph and follow-up questions.
- The single workspace and contextual dialogs, with evidence returning to the originating view.
- The previously completed 34 passing tests, passing production build and browser-flow checks. These verify the tested behaviours, not the missing professional reasoning or live-provider capability.

## Implementation sequence

1. **Trust and scope:** promote mandate, client constraints and material freshness gaps; preserve reporting semantics.
2. **Decision evidence:** aggregate repeated products, make look-through asset-aware, group related findings and connect material client needs to portfolio facts.
3. **Core briefing:** add the short visible narrative and specific conditional actions to the current workspace, with a complete deterministic fallback.
4. **External context and AI:** add relevant dated house-view ingestion, improve news relevance and validate grounded synthesis on the same evidence.
5. **Proof and pitch:** measure unfamiliar-client flows, show one meaningful graph reveal and rehearse the partner and public narratives.

Live transcription, sentiment dashboards, ex-custody PDF import and more graph decoration remain optional. They should not displace the core gaps above. Fast AI-assisted coding does not remove the need to verify financial meaning, source coverage and demo reliability.

The intended demo is: **an unfamiliar client becomes a useful short brief; one graph interaction explains the important connection; the adviser has a concrete next conversation step.**

## Evidence and limits of this assessment

- Official [UNRISKOMEGA presentation](</Users/teto/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/4638C9B7-4B9B-40A0-831E-E3D8326068CF/20260918_UnRiskOmega_EN.pdf>), slides 9–12: requirements, rubric and live test-client expectation.
- [Official case repository](https://github.com/START-Hack/unriskomega-2026): three additional same-shape client files, schema and date conventions.
- [Partner discussion knowledge base](</Users/teto/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/76B671E8-C8DB-451F-88F0-33818B315728/UNRISKOMEGA_Case_Knowledge_Base.docx>): discussion-derived clarifications, kept separate from formal requirements and author recommendations.
- Current implementation: `src/ClientWorkspace.tsx`, `src/AdvisorChat.tsx`, `src/lib/analysis.ts`, `src/lib/portfolio.ts`, `src/lib/briefing.ts`, `server/intelligence.ts` and `server/market-context.ts`; browser review and calculations on supplied cases.
- [CFA Institute portfolio planning](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/basics-of-portfolio-planning-and-construction) and [performance evaluation](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/portfolio-performance-evaluation): professional context for client constraints, allocation and performance interpretation, not additional hackathon rules.

This consolidates the two latest audits. The older `PARTNER-NOTES-AUDIT.md` records an earlier implementation and contains gaps that have since been resolved; it should not be treated as the current readiness checklist. No implementation changes or new tests were performed solely to merge these findings.
