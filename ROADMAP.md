# Genie Reports Roadmap

This plan captures the next product direction for the Databricks Genie Reports
app so it can be picked up from a fresh chat or Databricks Git folder session.

## Product Direction

Keep the app as one Databricks App:

- FastAPI serves `/api/*`.
- React/Vite builds into `frontend/dist`.
- FastAPI serves the built frontend from the same deployed app.
- Databricks Genie remains the data-focused query engine.
- Optional external LLMs, such as Gemini, act as orchestrators only.

## Target Experience

Build the app into a lightweight report builder over a Genie Space.

1. Show curated query and visualization cards when the app opens.
2. Let users ask custom questions or start from a suggested card.
3. Render a report preview with title, narrative, chart, table excerpt, and SQL.
4. Export the preview as PDF or PowerPoint.
5. Export CSV/XLSX for detailed backing data when needed.
6. Apply the RL visual style from the design package.

## Progress

Completed:

- 2026-06-26: Added `backend/report_templates.py` with seven curated report
  cards.
- 2026-06-26: Added `GET /api/suggestions` for the report card gallery.
- 2026-06-26: Replaced the hardcoded frontend prompt chips with a backend-driven
  suggestion gallery.
- 2026-06-26: Ported the RL visual tokens into `frontend/src/styles.css`.
- 2026-06-26: Verified desktop and mobile rendering of the suggestion gallery.
- 2026-06-26: Added a normalized report preview model and `POST /api/report`.
- 2026-06-26: Wired free-form questions and report card clicks through the
  report preview flow.
- 2026-06-26: Added branded PDF export via `POST /api/export/pdf`.

- 2026-06-26: Added PPTX single-report export via `POST /api/export/pptx`.
- 2026-06-26: Added multi-report bundle export via `POST /api/export/bundle`
  (PDF and PPTX, one section/slide per report).
- 2026-06-26: Redesigned frontend with Playfair Display serif headings, navy
  topnav, skeleton loading, hover animations, and sticky bundle-export tray.
- 2026-06-26: Added report assembly UI — checkbox per result, select-all,
  sticky Export PDF / Export PPTX tray when reports are selected.
- 2026-06-26: Added multi-chat report sessions with stable selected-report
  assembly, footer cancel, auto-close after bundle download, and in-chat
  response progress tracking.
- 2026-06-26: Adjusted frontend terminology from reports to insights for
  LLM-generated commentary/material, and added the missing `python-pptx`
  dependency for PowerPoint exports.

Next development slice:

- Add the optional orchestrator interface starting with a no-op provider.
- Add Gemini orchestrator behind env vars and Databricks secret resource.
- Add HTML export option to bundle tray.

## Suggested Report Cards

Start with a small curated library in backend code, for example:

- Revenue trend by month.
- Top customers by revenue.
- Regional performance comparison.
- Product/category contribution.
- Margin or cost outliers.
- Year-over-year change.
- Operational exceptions or anomalies.

Each card should define:

- `id`
- `title`
- `description`
- `prompt`
- `visual_type`
- `preferred_export`
- `required_columns`, if known

## Backend Work

Add these modules and endpoints:

- `backend/report_templates.py`
  - Static curated cards and prompt templates.
- `GET /api/suggestions`
  - Returns available report/query cards.
- `POST /api/report`
  - Accepts a card ID or free-form question.
  - Calls Genie.
  - Returns normalized report preview data.
- `POST /api/export/pdf`
  - Creates a branded PDF report.
- `POST /api/export/pptx`
  - Creates a branded PowerPoint deck.

Recommended libraries:

- Keep `openpyxl` for Excel export.
- Add `reportlab` for PDF generation.
- Add `python-pptx` for PowerPoint generation.

Avoid a browser-rendered PDF dependency unless layout requirements become too
complex for `reportlab`.

## Frontend Work

Add a report-builder flow:

- Suggestion gallery on the initial screen.
- Report preview view with chart, narrative, table excerpt, and SQL toggle.
- Export menu with PDF, PowerPoint, CSV, and Excel options.
- Chart type selection where reasonable.
- Loading and error states for export jobs.

Keep repeated-use workflow dense and operational rather than marketing-style.

## RL Styling

Likely design package path found locally:

`/Users/fabio.fabrizio/Projects/ai-usecase-chatbot/packages/design`

Useful theme tokens from its Tailwind/daisyUI config:

- Primary navy: `#1A2536`
- Warm base: `#F8F4EA`
- Secondary tan: `#B18A56`
- Accent burgundy: `#6F2531`
- Success green: `#2F6A4C`

First implementation should port the relevant CSS tokens into this repo rather
than depending on the external package path at runtime. Only import the package
directly if it becomes published or vendored into this repo.

## Databricks Runtime Configuration

Use `app.yaml` for runtime variables.

Plain non-secret config:

```yaml
env:
  - name: REPORT_MAX_PREVIEW_ROWS
    value: "100"
  - name: ORCHESTRATOR_PROVIDER
    value: "gemini"
```

Databricks resources and secrets:

```yaml
env:
  - name: GENIE_SPACE_ID
    valueFrom: genie-space
  - name: GEMINI_API_KEY
    valueFrom: gemini-api-key
  - name: DATABRICKS_WAREHOUSE_ID
    valueFrom: sql-warehouse
```

Attach the corresponding resources in Databricks Apps UI. Use Databricks secret
resources for external API keys.

## Optional Orchestrator Pattern

Use an external LLM as an orchestrator, not as the source of data truth.

Recommended flow:

1. User asks a question.
2. Orchestrator chooses a report card, prompt, or visualization spec.
3. Genie answers the data question and generates/runs SQL.
4. Backend validates result shape and builds report preview data.
5. Orchestrator may summarize only from Genie output and returned rows.
6. App stores audit metadata: user question, Genie prompt, SQL, row count, and
   export timestamp.

Possible module layout:

- `backend/orchestrators/base.py`
- `backend/orchestrators/gemini.py`
- `backend/orchestrators/noop.py`

Start with `noop.py` so the app works without external LLM credentials.

## Implementation Order

1. Done: add suggestion gallery and `GET /api/suggestions`.
2. Done: add report preview model and `POST /api/report`.
3. Done: apply RL styling tokens.
4. Done: add PDF export.
5. Add PowerPoint export.
6. Add optional orchestrator interface.
7. Add Gemini orchestrator behind env vars and Databricks secret resource.

## First PR Scope

Completed first slice:

- `backend/report_templates.py`
- `GET /api/suggestions`
- Frontend suggestion gallery.
- RL styling tokens in `frontend/src/styles.css`.
- No external LLM or new export format yet.

This gives a visible product improvement with limited deployment risk.
