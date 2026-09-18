# Compass demonstration

## Start and reset

Start the company-news service with `docker compose up -d --build` and confirm `docker compose ps` reports healthy. Run `npm run dev`; use the configured local Codex login or the immediate structured fallback. Open `/uro-entry-demo.html` to show the **simulated** client-context entry, choose any supplied client and click Prepare client briefing. A real URO integration is not connected.

For an unfamiliar supplied JSON, click **Import clients** in Compass. A client array reuses current reference data; a client-plus-reference object replaces it. Import does not require code changes. **Restore cases** restores the original records. Close dialogs, choose CASE-005, reset the history range to 1M, and clear any synthetic research from the research library before presenting.

Do not claim that the renamed benchmark clients are the unseen jury cases. They prove identifier independence and the complete pipeline, alongside schema/unknown-security tests. The jury's actual file remains the live test.

## Partner demonstration — about two minutes

1. **Client first.** Open a supplied or imported client. Explain the service, dated instruction and selected scope. Show that pension liquidity is not assumed withdrawable.
2. **Read the brief.** Point to what changed, the leading concern, dated outlook and conditional next step. The baseline is usable while news and Codex finish.
3. **Explain one connection.** On CASE-005, open the gold concentration finding and **Trace exposure**. One verified fund sits in two portfolios: 20.47% combined. Inspect the source showing both positions. Return to the brief.
4. **Show professional judgment.** The old reference dates affect 16.3% of assets; the system asks for verification rather than asserting wrong valuations. Commodity products are not counted as missing equity-company lists.
5. **Ask a real question.** Open the bottom-right **Ask Compass** popup. On CASE-012: “How should I prepare for the tax conversation, given the cash balance and mandate?” Show the dated CHF 15,000 note, CHF 328 reported balance and confirmation step. The app does not invent an outstanding shortfall or a sell order.
6. **Outlook and sources.** Open an exposure's News link. Explain name/topic matching, exact publication dates and unverified impact. Import an actual dated research JSON when supplied by the partner; distinguish public research from uploader-declared approved research.

If a provider fails, keep using the sourced brief. Do not wait for all funds to resolve or claim full look-through. If portfolios overlap, select one scope before interpreting totals. If asked for one-day returns, show “not available” because the export is monthly.

## Public pitch — four-slide outline

**1. The problem: the meeting starts before the meeting.** An adviser has client notes, positions, funds, market headlines and policy in separate places. The difficult part is knowing what matters for this client.

**2. The outcome: one minute to a useful conversation.** Compass gives a short sourced brief: what changed, what needs attention, what to watch, and the next question to resolve. Show the current workspace rather than an architecture diagram.

**3. The reveal: two accounts, one hidden concentration.** Animate or click the actual gold finding. Show both portfolios feeding the same fund, and its combined weight. A graph earns its place by explaining a decision.

**4. Trust and next step.** Upload a new client live. Facts appear immediately; external context and AI follow. Every claim has a source, and missing data stays unknown. Finish: “Compass helps the adviser enter the conversation prepared.”

Measured on this machine: initial calculation 4–19 ms; full refresh plus Codex 6.75–8.53 s on three renamed case imports. Browser rendering excluded; incomplete fund coverage is explicit. Present this as a measured rehearsal, not a universal ten-second guarantee.

## Before going on stage

- Run `npm test` and `npm run build` after the final change.
- Check Codex is signed in and the executable/model in `.env.local` is available. Keys and local configuration are ignored by Git.
- Keep a local copy of the client JSON and any real research file. `public/research-template.json` explains the format and is **not research**.
- Use the structured brief if AI is unavailable; the screen labels the mode.
- Do not claim real URO access, complete company look-through, validated causal news attribution, trade execution, realtime transcription or PDF ingestion.
