# Setup — going online + receipt scanning

The app runs **fully local** out of the box (`npm run dev`). Follow this only when
you want (a) online access + sync across phone and desktop, and (b) receipt scanning.
Everything below uses **free tiers** and needs **no credit card**.

You'll create three free accounts. Give me the values in **bold** and I'll wire them up.

---

## 1. Supabase (database + login) — for online sync

1. Sign up at <https://supabase.com> → **New project** (pick a region near you, e.g.
   Singapore). Wait ~2 min for it to provision.
2. Open **SQL Editor** → paste the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → **Run**.
3. **Database → Extensions** → enable **`pg_cron`**. Then back in the SQL editor run:
   ```sql
   select cron.schedule('duit-recurring', '0 1 * * *', $$select public.post_due_recurring();$$);
   ```
   (This posts recurring charges daily even when the app is closed.)
4. **Authentication → Providers → Email** → turn on **Email** (magic link is fine;
   you can disable "Confirm email" for a personal single-user app to skip the extra click).
5. **Project Settings → API**, copy:
   - **Project URL**  → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`  (this one is safe in the browser)

> Note: the client sync layer + magic-link login screen is the one piece I'll finish
> wiring once your project exists, so we can test it live against real data.

---

## 2. Google Gemini (receipt reading) — free tier

1. Go to <https://aistudio.google.com/app/apikey> → **Create API key** (free, no card).
2. Copy the key → this becomes the **`GEMINI_API_KEY`** secret (server-side only).

---

## 3. Cloudflare Pages (hosting + the scan function) — free

1. Sign up at <https://dash.cloudflare.com>.
2. **Workers & Pages → Create → Pages → Connect to Git** (push this repo to GitHub
   first) — or use direct upload. Build settings:
   - Build command: `npm run build`
   - Output directory: `dist`
3. **Settings → Environment variables** add:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (from step 1) — *build variables*
   - `GEMINI_API_KEY` (from step 2) — used by the `/api/scan-receipt` function
   - optional `GEMINI_MODEL` (defaults to `gemini-2.0-flash`)
4. Deploy. Open the `*.pages.dev` URL on your phone → **Add to Home Screen** to install.

### Local dev for the scan function
The scanner calls `/api/scan-receipt`, which only exists when served by Cloudflare.
To test it locally:
```bash
npm run build
npx wrangler pages dev dist --binding GEMINI_API_KEY=your_key_here
```

---

## What to send me to finish the online wiring

- **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`**

The Gemini key and any secrets go straight into Cloudflare's dashboard — **never paste
API keys or passwords into the chat.** I'll handle the sync + login code; you paste the
secrets into Cloudflare/Supabase yourself.
