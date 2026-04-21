# Audit Report: Art feed (PR #3)

Parent PRD: _None linked; [PR #3](https://github.com/Wulgaren/DeepLearn-Learning-Site/pull/3) has empty description._  
Date: 2026-04-21  
Files in scope: 49 (per `git diff main...HEAD --stat`)

## Summary

The art feed work is generally coherent (normalized artwork shape, query clamping, Wikidata Q-ID validation for artist view, HTTPS checks on stored image/catalog URLs, partial Europeana failure handling). **It is not safe to treat as “done” from a security perspective** while edge handlers use `getUserId()` (JWT payload decode **without signature verification**) together with the **Supabase service role**: a caller can supply an arbitrary `sub` and the server will trust it. **New in this PR**, `art-threads` uses that pattern to read another user’s saved art threads if the attacker knows or guesses their UUID. Separately, **decoded pagination cursors are not bounded**, so malicious `cursor` values can drive very large Wikidata `OFFSET`s (cost/abuse). Fix JWT verification (or use user JWT + RLS instead of service role for user-scoped reads/writes) and clamp cursor numerics before use.

## Critical findings

### 1. Unverified JWT `sub` + service role enables impersonation (art-threads and related writes)

**Location**: `netlify/edge-functions/lib/shared.ts` (approx. `getUserId`, lines 78–99); `netlify/edge-functions/art-threads.ts` (approx. lines 15–46); same pattern in `thread-from-tweet.ts`, `thread-expand-replies.ts`, and other pre-existing handlers.  
**Category**: Security  
**Problem**: `getUserId` only base64-decodes the JWT middle segment and reads `sub`. It does **not** verify the signature. Any client can send `Authorization: Bearer <two valid-looking base64url segments>` with a chosen `sub`. Handlers that use `createClient(url, SUPABASE_SERVICE_ROLE_KEY)` then query or mutate rows **as if** that user were authenticated. **`art-threads`** filters `topics.user_id` by this `sub`, so an attacker who targets a victim’s `auth.users` id can retrieve that user’s Art-topic threads (titles, image URLs, catalog links, reply state). **`thread-from-tweet`** / **`thread-expand-replies`** similarly trust `sub` for topic/thread ownership, so forged tokens can create or expand threads in another user’s namespace.  
**Suggestion**: Verify the access token (e.g. Supabase JWKS / `auth.getUser` pattern, or `jwt.verify` with project secret) before trusting `sub`, **or** stop using the service role for user-scoped operations and instead forward the user’s real JWT to Supabase so RLS enforces ownership. Apply the same fix consistently across all edge functions that combine `getUserId` + service role.

---

## High findings

### 1. Pagination cursors accept unbounded numeric offsets

**Location**: `netlify/edge-functions/art-combined.ts` (`decodeCursor`, approx. lines 28–44; state applied approx. 105–135); `netlify/edge-functions/art-artist.ts` (`decodeCursor`, approx. lines 18–27; `wdOffset` used approx. 259–277); `netlify/edge-functions/lib/art-shared.ts` (`fetchWikidataPage`, `OFFSET` derived from `page * limit`, approx. lines 246–264).  
**Category**: Logic / Security (abuse)  
**Problem**: Decoded cursor JSON trusts `metPage`, `wdPage`, and `wdOffset` as any finite number. A client can pass a cursor with huge `wdPage` or `wdOffset`, producing enormous SPARQL `OFFSET` values. That can harm WDQS, slow or fail the edge function, and burn shared quotas. Individual `art-wikidata` / `art-met` handlers clamp `page` via `clampWikidataPage`, but **combined** and **artist** paths bypass that for cursor-carried state.  
**Suggestion**: After decoding, clamp `wdPage` / `wdOffset` / `metPage` (and any similar fields) with the same bounds as `clampWikidataPage` (and a sensible cap for Met’s internal page index if needed). Reject cursors outside range with 400.

---

## Medium findings

### 1. Duplicated Wikidata → `NormalizedArtwork` mapping

**Location**: `netlify/edge-functions/lib/art-shared.ts` (Wikidata list mapping, approx. lines 304–340); `netlify/edge-functions/art-artist.ts` (`fetchWikidataByArtist` bindings → items, approx. lines 99–136).  
**Category**: Best practices  
**Problem**: Nearly identical mapping logic appears in two places. Future fixes (URL handling, deduplication, rights text) can drift.  
**Suggestion**: Extract a shared `bindingsToNormalizedArtwork(bindings)` or reuse a single mapper from `art-shared.ts`.

### 2. Misleading use of `clampWikidataPage` for Met pagination

**Location**: `netlify/edge-functions/art-met.ts` (approx. lines 22–24).  
**Category**: Consistency  
**Problem**: Met handler uses `clampWikidataPage` to bound the `page` parameter. The constant name and cap semantics are Wikidata-oriented; readers may assume wrong limits for Met.  
**Suggestion**: Rename to a neutral `clampArtFeedPage` or add `clampMetPage` with an explicit Met-appropriate max (even if numerically the same today).

### 3. No automated tests for art edge or client flows

**Location**: Feature spans `netlify/edge-functions/art-*.ts`, `src/pages/Art*.tsx`, `src/contexts/ArtRouteContext.tsx`.  
**Category**: Best practices  
**Problem**: Regression risk for cursor encoding, auth behavior, dedupe keys, and Europeana skip logic.  
**Suggestion**: Add focused tests (e.g. cursor round-trip + clamp, artist Q-ID rejection, thread dedupe) where the stack allows.

---

## Low findings

### 1. Open embed preview for threads (pre-existing behavior; art threads inherit)

**Location**: `netlify/edge-functions/embed-thread.ts` (approx. lines 60–70); `thread-get.ts` returns thread when unauthenticated (approx. lines 44–67).  
**Category**: Security / product  
**Problem**: Anyone with a thread UUID can fetch OG/embed HTML or JSON for that thread. Art saves add more content that may be discoverable via guessed IDs (low probability but non-zero).  
**Suggestion**: If threads should be private, gate reads on auth or signed tokens; if public-by-link is intended, document it.

---

## No findings

- **Input sanitisation (art-specific)**: `clampArtSearchQuery`, `clampArtExternalId`, Wikidata artist `Q\d+` check, `https` requirement for stored `mainImageUrl` / `catalogUrl`, and `normalizeArtSource` whitelist are reasonable for this layer.  
- **RLS / schema**: `saved_artists` and `threads` policies in `supabase/schema.sql` are consistent with user-owned rows when accessed via a properly authenticated Supabase client; the gap is the edge layer trusting `sub` without verification.  
- **Partial upstream failure**: `art-combined` skipping Europeana on error while continuing Met + Wikidata is a sensible degradation path.

---

## Files in scope (confirm completeness)

From `git diff main...HEAD --stat`:

`.cursor/rules/*.mdc`, `.env.example`, `README.md`, `bun.lock`, `eslint.config.js`, `netlify/edge-functions/art-artist.ts`, `art-combined.ts`, `art-europeana.ts`, `art-met.ts`, `art-threads.ts`, `art-wikidata.ts`, `embed-thread.ts`, `lib/art-cursor.ts`, `lib/art-limits.ts`, `lib/art-shared.ts`, `lib/shared.ts`, `lib/thread-ai-replies.ts`, `thread-expand-replies.ts`, `thread-from-tweet.ts`, `thread-get.ts`, `package.json`, `src/App.tsx`, `src/components/ArtRightRail.tsx`, `ArtworkDetailModal.tsx`, `AuthPage.tsx`, `ConditionalArtRouteLayout.tsx`, `Layout.tsx`, `src/contexts/ArtRouteContext.tsx`, `src/hooks/useDocumentTitle.ts`, `src/lib/api.ts`, `artFeedSeed.ts`, `artModal.ts`, `artRouteUtils.ts`, `artTweet.ts`, `src/pages/Art.tsx`, `ArtArtist.tsx`, `Feed.tsx`, `Home.tsx`, `NewThread.tsx`, `Thread.tsx`, `src/types.ts`, `src/types/art.ts`, `supabase/schema.sql`, `vite.config.ts`

_If anything outside this list belongs to PR #3, add it before acting on the report._
