# MiniMax M3 ingestion replay

Run `npm run reingest:minimax` to replay the available Compass inputs through the existing Azure-billed `FW-MiniMax-M3` deployment. This is a separate extraction and quality run; it does not overwrite source data or the current browser workspace. Azure endpoint/key configuration stays in ignored `.env.local`. No resources are provisioned and no direct Fireworks billing route is used.

The runner processes the app-safe client projection plus original transactions and individual rule overrides; all security-master records and other reference tables; every fund-unbundling row; all prepared fund snapshots; all ten custody PDFs; and a frozen snapshot of the public news/world providers. Account/contact identifiers are excluded. The 48,101 fund-unbundling rows are dictionary-encoded without aggregation; every row and original weight remains present. All 80 PDF pages are supplied as coordinate-preserving text. The measured PDF schema includes positions, cash, performance, contributions, chart allocations, currency matrix, unhedged FX, sustainability, selected transactions and annual performance history. It does not score chart vector geometry or every printed footer and intermediate cell.

The first context capture searches every unique portfolio news target, including each individual portfolio scope, and freezes results once. Existing provider limits still apply: two ranked articles per exposure, available snippets rather than full article bodies, sampled AIS/FIRMS data, and partial source feeds. An empty research library is reported as absent; the example research template is excluded.

Results are saved locally under ignored `test-results/minimax-reingestion/`:

- `report.html`: filterable quality report with source/actual comparisons.
- `run.json` and `jobs/*.json`: raw model output, checks, timestamps and token counts.
- `model-output.json`: consolidated output records, each marked passed/review/failed.
- `source-manifest.json`: source hashes and job inventory.
- `ingestion-context.raw.json`: frozen provider records and client scope ownership.

Source agreement is a field comparison, not an overall intelligence score. Missing fields, altered numbers, invented fields and changed row order are flagged. The absolute numeric tolerance is 0.000001. PDF identity-aligned assessment separately distinguishes row order from actual financial errors. For live news, allowed identifiers and literal evidence spans are checked; there is no independently labeled semantic ground truth. A separate 25-case synthetic issuer challenge measures disambiguation accuracy. Baseline disagreements are review candidates, not automatically model errors.

By default the command resumes previously completed jobs whose input, schema, instructions and model fingerprints match. Failed calls are retried. Use a new `INGESTION_OUTPUT=test-results/<new-run>` directory for a fresh provider snapshot and full new run. `INGESTION_CONCURRENCY=8` permits eight simultaneous requests (default four). Optional `INGESTION_KIND` and `INGESTION_LIMIT` run a clearly labeled subset; `--retry-all` reruns selected jobs. Changing `INGESTION_MODEL` selects another existing Azure deployment. Model calls incur inference usage.

The chat adapter supplies the output schema both in the prompt and in `response_format`. Fireworks' [structured-output documentation](https://docs.fireworks.ai/structured-responses/structured-response-formatting) explains that generation constraints alone do not make the schema visible to the model. An initial PDF pilot exposed this configuration problem; it is preserved separately in the run artifacts and excluded from the corrected full-run metrics.
