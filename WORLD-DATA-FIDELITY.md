# World data fidelity review

Reviewed 19 September 2026. Scope: matching public events to the selected client and portfolio, exposure arithmetic, graph traceability, and presentation. Work was split across matching, exposure calculations, and UI/map review.

## Confirmed defects repaired

| Before | After |
| --- | --- |
| Per-client searches accepted any distinctive word from a company name, while World Monitor used different rules. Equatorial Guinea could match Equatorial SA; Pacific earthquake reports could match Union Pacific. | Both paths use the same phrase matcher. Geography, ambiguous common words and known similarly named issuers have regression coverage. Non-news sensor records cannot establish a company match. |
| Accents, acronyms and share-class decorations produced inconsistent results. | Normalize accents and legal/class suffixes, retain meaningful multiword names, and require uppercase business context for short acronyms. Alternative names are retained when the exact same instrument ID joins holdings. |
| Fund weights could change without changing the refresh key. | The key includes the full current target records, including weights and aliases. Pinned context is invalidated with that key. Displayed links are restricted to the current target set and weights are recalculated. |
| The same headline could appear through a Google link and its publisher URL. | Merge identical normalized headlines on the same UTC date, preserve the union of supported ownership links, and count each instrument weight once. Distinct sensor observations retain their IDs even when they share a map URL. |
| Complete fund snapshots were truncated to ten constituents in exposure calculations and the graph. | Matching, calculations and graph expansion use all valid published equity constituents. A regression traces constituent 12 through its fund and portfolio to the client. |
| Zero or invalid constituents could generate company news targets. A non-equity fund could acquire country exposure from an inappropriate company list. | Reject inactive/invalid weighted positions and constituents; apply the same equity look-through eligibility throughout. Country fallback has dated constituent-source evidence. |
| Country and sector context appeared in the same client bucket as company mentions; market benchmarks could look client-specific. | Separate Held companies, Macro context and Global. Label benchmarks as global and expose matching holdings, fund dates, source links and coverage gaps. |
| A country in a company headline could become a map pin, suggesting an event location. | Plot valid provider coordinates only; distinguish source article location from reported event location. Unlocated stories remain in the list. |

## Verification

- Full suite: 123 tests passed. Production build and whitespace checks passed. Removed an unused, unsupported PDF.js initialization option that blocked the shared workspace build.
- Regressions exercise matching parity across the shared matcher, World Monitor and per-client RSS; ambiguous issuer names; aliases; merged exposure; client/scope changes; date windows; sensor boundaries; map coordinates; and complete-fund graph traces.
- Exposure consistency is checked for all 47 supplied clients across 104 client/portfolio scopes, including overlapping consolidated portfolios with unknown combined weights.
- Browser checks cover the separated views, rejection of the Equatorial Guinea false company match, and switching from Joker to Yoda without retaining the previous client's company matches or search filter.
- Live provider connectivity was verified separately during the AISstream/EIA/FIRMS integration; passing these fidelity tests does not certify every live article.

## Remaining data limitations

Matching remains a conservative rule-based inference from provider text and verified symbols, not full-article fact checking. Unfamiliar company aliases can be missed; identical-title deduplication does not collapse every syndicated paraphrase. Published constituent snapshots can be partial or dated. Bond issuer risk, business facilities, revenue geography and shipping dependencies are not supplied by the client records and are not inferred. Broad fund regions remain regions. Shared global prices, ships and thermal detections are context, not evidence that a client owns or is operationally exposed to them.
