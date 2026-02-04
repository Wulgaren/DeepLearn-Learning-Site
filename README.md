# Learning feed

Turn any topic into a Twitter-style AI feed: generate threads with Groq, open threads to read replies, and ask follow-up questions. Data and auth via Supabase; deploy on Netlify.

**Requirements:** [Bun](https://bun.sh/) (package manager and runtime). Node.js is not required.

## Run locally (full stack with functions)

1. **Env** – Copy `.env.example` to `.env` and fill in your keys. (`.env` is gitignored—do not commit it.)

   - `VITE_SUPABASE_URL` – Supabase project URL  
   - `VITE_SUPABASE_ANON_KEY` – Supabase anon/public key  
   - For **Netlify dev** (functions), also set in the same `.env` (or Netlify UI):
     - `SUPABASE_URL` – same as `VITE_SUPABASE_URL`  
     - `SUPABASE_SERVICE_ROLE_KEY` – Supabase service role key (Dashboard → Settings → API)  
     - `GROQ_API_KEY` – [Groq](https://console.groq.com/) API key  

2. **Supabase** – In the [Supabase SQL Editor](https://supabase.com/dashboard), run the contents of `supabase/schema.sql` to create tables and RLS.

3. **Install and run with Netlify (recommended for debugging):**

   ```bash
   bun install
   bun run dev:netlify
   ```

   This starts the Vite app and Netlify Functions together (e.g. at `http://localhost:8888`). The app will call `/.netlify/functions/*` so auth and APIs work locally.

4. **Frontend only (no functions):**

   ```bash
   bun run dev
   ```

   Use this only for UI work; generating threads and follow-up answers need the functions (run with `dev:netlify`).

## Deploy on Netlify

- Connect the repo to Netlify; build command: `bun run build`, publish directory: `dist`.
- Add the same env vars in Netlify (Site → Settings → Environment):  
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`.

## What’s included

- **Auth:** Sign up / log in with email and password (Supabase Auth). Same account on any device.
- **Feed:** Enter a topic → Groq generates several threads (main post + replies). List of “My topics” and thread cards per topic.
- **Thread:** Open a thread to see the main post and replies; ask follow-up questions and get tweet-style answers (with thread + Q&A history sent to Groq).
- **Stack:** Vite + React + TypeScript, Tailwind CSS, Netlify Functions, Supabase (DB + Auth), Groq.

## License

MIT – see [LICENSE](LICENSE). Add your name to the copyright line in `LICENSE` if you want.
