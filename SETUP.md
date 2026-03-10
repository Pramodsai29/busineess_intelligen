# Query to Canvas — Setup Guide

## What This App Does
Upload any CSV → ask questions in plain English → Claude generates SQL → results visualized as charts or tables. Powered by Claude (Anthropic) + Supabase.

---

## Architecture

```
Browser (React/Vite)
    ↕ Supabase JS client
Supabase Edge Functions (Deno)
    ↕ Anthropic API (Claude)          ← NEW (replaces Lovable AI Gateway)
    ↕ Supabase Postgres
        → campaigns table (default)
        → <your_csv> table (dynamic)  ← NEW
```

---

## Step 1 — Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Copy your **Project URL** and **Anon Key** (Settings → API)
3. Update `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key_here
VITE_SUPABASE_PROJECT_ID=your_project_ref
```

---

## Step 2 — Run Database Migrations

In the Supabase dashboard → **SQL Editor**, paste and run **both** migration files in order:

1. `supabase/migrations/20260310145254_*.sql` — creates the `campaigns` table + `execute_readonly_query` function
2. `supabase/migrations/20260310200000_upgrade_schema.sql` — adds `execute_admin_sql` for dynamic CSV tables

Or via CLI:
```bash
npx supabase db push
```

---

## Step 3 — Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key
2. In Supabase dashboard → **Edge Functions** → **Secrets** → add:

```
ANTHROPIC_API_KEY = sk-ant-...your key...
```

> The app uses **claude-sonnet-4-20250514** for SQL generation and **claude-haiku-4-5** for chart type selection. Haiku is much cheaper for the chart classification step.

---

## Step 4 — Deploy Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy both functions
supabase functions deploy generate-dashboard
supabase functions deploy upload-csv
```

> Make sure `ANTHROPIC_API_KEY` secret is set **before** deploying.

---

## Step 5 — Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:8080](http://localhost:8080)

---

## How to Use

### With Default Data (campaigns table)
The app ships with a `campaigns` table schema for marketing data. If you have existing data loaded, just type a question like:
- "Show revenue by campaign type"
- "Monthly revenue trend"
- "Marketing funnel breakdown"

### With Your Own CSV
1. Click **Upload CSV** in the sidebar
2. Any CSV works — columns are auto-detected and types inferred
3. The uploaded table appears in the sidebar — click it to make it **ACTIVE**
4. Example queries update automatically based on your columns
5. Ask any question — Claude gets the schema and generates the right SQL

### Features
- **Chart / Table toggle** — switch between chart and raw data table per result
- **Export CSV** — download any result as a CSV file
- **Show SQL** — see the exact SQL Claude generated
- **Multi-table** — upload multiple CSVs and switch between them
- **Conversation context** — follow-up questions are contextual

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "ANTHROPIC_API_KEY is not configured" | Add secret in Supabase → Edge Functions → Secrets |
| "Failed to create table" | Run the upgrade migration (Step 2) |
| SQL errors on your CSV | Check column names in the Schema panel; avoid special characters |
| CSV upload fails | Max 10MB; UTF-8 encoding; first row must be headers |
| Charts show no data | Your query returned 0 rows — try a broader question |

---

## Column Type Inference

When you upload a CSV, the backend auto-detects types:

| Data pattern | Postgres type |
|---|---|
| All integers (`1`, `42`) | `BIGINT` |
| All decimals (`3.14`, `99.9`) | `FLOAT` |
| All dates (`2024-01-15`, `01/15/2024`) | `DATE` |
| true/false/yes/no/1/0 | `BOOLEAN` |
| Everything else | `TEXT` |

---

## Cost Estimate (Anthropic API)

- SQL generation: claude-sonnet-4-20250514 ~$0.003 per query
- Chart type selection: claude-haiku-4-5 ~$0.00005 per query
- **~$0.003 total per dashboard generated**

For 1000 queries/month ≈ **~$3**
