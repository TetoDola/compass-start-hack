# UI concept references

These generated images are visual references for the cockpit and meeting brief. They use fictional client names and values; the application continues to render its own records and calculations.

- `cockpit-concept.png` — generated with the built-in image tool. Prompt: “Redesign a professional private wealth adviser cockpit at desktop width. Keep a restrained Swiss financial software feel: compact navigation, integrated portfolio summary, client profile and notes on the left, a dominant portfolio chart and risk contributors in the center, concise review actions on the right, and a clean exposure table below. Use generous whitespace, readable typography, subtle dividers, warm gray and white surfaces, deep ink, muted blue gray, and sparing orange and teal accents. Use fictional client data. Avoid gradients, glassmorphism, decorative illustrations, floating chat controls, and tiny type.”
- `brief-concept.png` — generated with the built-in image tool. Prompt: “Design a polished companion meeting brief at desktop width. Make the brief an editorial reading surface with preparation status, a prominent client preference quote, and four numbered sections: What changed, Portfolio state, Why it matters, and Next conversation. Place client profile, composition, review points, and a compact news feed beside it. Keep source links and financial caveats visible. Use the same restrained palette and fictional client data. Avoid decorative effects, tiny typography, and dense card borders.”

## Implemented merged overview

The approved `merged-compact-brief-concept.png` is the layout reference for the combined page: a summary strip, compact sourced meeting brief, client profile and notes, portfolio analysis, review actions and related news. The previous Cockpit/Brief switch is removed.

The implementation uses the application's supplied data, including scoped positions, aggregate products, region exposure, risk contributions, source evidence, records, news, current instrument prices and imported-statement performance. Expanded details keep lengthy explanations out of the overview.

### Template elements omitted

- Invested capital, estimated annual income/yield, and inferred YTD or annualized return: these cannot be calculated reliably from ordinary case snapshots. Imported statement performance remains available when supplied by the document.
- Family, adviser identity, financial goals and next-review dates: the current data does not support the mockup's fields.
- Scheduling, editable notes, comparison and scenario buttons: no corresponding persisted workflow exists.

### Useful next additions

1. Saved review actions with an owner, status and due date.
2. Persistent meeting notes and a history of completed reviews.
3. Cash-flow-aware portfolio performance once a transaction ledger is available.

Coverage and source status are included now because the application already knows where classifications, fund constituents or market data are incomplete.
