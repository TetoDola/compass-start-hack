# Combined World intelligence and wealth-management fixes

The current exposure globe is insufficient: it needs external events and market context, and a complete path from those signals into the client conversation. This implementation combines both audits.

## Scope

- Global and client-relevant views; news, maritime chokepoints/warnings and natural-event layers, time filtering, map clusters, source coverage and market quotes with observation times.
- Preserve source dates and distinguish reference infrastructure, dated events and inferred portfolio relevance. Never infer a company facility or shipping dependency from its reference country.
- Restore visible portfolio-health priorities. Rank company-specific news ahead of broad topic matches. Apply the same briefing rules to every news provider.
- Trace an event through its ownership ancestors to fund/portfolio/client. Carry the selected source and current scope into chat and allow an adviser to add the talking point to the brief.
- Keep scenario subject explicit; reset it when the event changes. Keep the explanation and main actions visible beside the map at laptop widths.
- Recompute merged-article exposure; preserve unknown imported weights; do not inflate partial fund mappings.

## Validation

Regression tests cover each financial/integration defect and source parsing/failure behavior. Build and existing tests must pass. Inspect the live World → graph → chat → brief journey, client changes, keyboard controls and responsive layout. Record actual source availability separately from passing code checks.

## Data boundary

The public intelligence fetch is shared and contains no client records. Some World Monitor sources need credentials or populated caches; unavailable sources remain visibly unavailable. Direct USGS/NASA public feeds supplement empty disaster caches. Quotes must disclose their own observation time, not substitute retrieval time.
