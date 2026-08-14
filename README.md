# Duit — Personal Finance Tracker

A phone-first, installable finance tracker that unifies your **TouchNGo e-wallet**
and **credit card** spending into one glance — with automatic recurring charges,
a live credit-card balance, budget tracking, receipt scanning, and a projected-savings
warning so the end-of-month bill never surprises you.

## What it does

- **One glance dashboard** — total spent this cycle, split by wallet, with your
  **credit-card balance building up in real time**.
- **Projected savings** — income − spending − committed recurring, with a warning
  when you're trending below your target.
- **Recurring engine** — set insurance/subscriptions once; they post themselves
  every month (client-side on open, and server-side via cron even when closed).
- **5-second Quick Add** and **receipt scanning** (snap → vendor/total/date filled in).
- **Statement import** — paste a card / TouchNGo statement; duplicates are skipped.
- **Budgets** per category (e.g. RM2,500 discretionary food) with a pace marker.
- **Local-first** — data lives on your device; optional cloud sync for online access.
- **Backup / restore** — export and re-import all data as a JSON file.

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL. The app works fully **local-only** (data in your browser) with
no accounts or keys. See [SETUP.md](SETUP.md) to enable online sync and receipt scanning.

## Stack

Vite · React · TypeScript · Tailwind · Dexie (IndexedDB) · vite-plugin-pwa.
Optional backend: Supabase (Postgres + Auth + pg_cron) and Cloudflare Pages
(hosting + the receipt-scan function that calls Google Gemini).

## Project layout

- `src/lib/` — data layer (`db`, `repo`, `sync`), domain logic (`selectors`,
  `cycle`, `recurring`, `autopost`, `import`, `backup`, `scan`).
- `src/screens/` — Dashboard, Transactions, Recurring, Settings, QuickAdd,
  ReceiptScanner, ImportStatement, Onboarding.
- `functions/api/scan-receipt.ts` — Cloudflare Pages Function (Gemini proxy).
- `supabase/migrations/0001_init.sql` — schema, RLS, recurring auto-poster.
