---
name: try-record-coverage
description: Phase 2 of `meticulous try` — record 15–30 Meticulous sessions of the locally served app, crawler first and then targeted recordings of the flows it misses, and wait until they are ingested.
---

# Phase 2 — Record coverage

Goal: 15–30 ingested sessions that together cover the app's main routes and flows, so the
backtests in phase 3 replay meaningful journeys — **especially the pages the candidate PRs
touched**. Budget: ~15 minutes. The app from phase 1 must still be serving on
`http://localhost:<port>` (`meticulous try recipe show` has the port).

## 1. Make a route list (2 minutes)

From the router (`react-router` route tables, `pages/` / `app/` directories, Angular routes,
Vue router, links in the nav component) list the main user-facing routes with a concrete URL
each (fill dynamic segments with ids that exist in the data you saw). Then read
`candidate-prs.json` and mark the routes/components the top candidates change — those must be
covered.

## 2. Crawl

If the app needs a login, settle it first with `.claude/skills/try-app-login/SKILL.md` and pass
the saved state (`auth/storage-state.json`) as `--storageState`. The crawler exits with code 2
when every page it reached had a login-like URL (`/login`, `/signin`, `/auth`, ...) or was on
another origin; that means the storage state is missing, expired or for another origin, not that
the crawl failed. It judges by URL only, so exit code 0 does not prove the crawl got past the
login: an app that shows its login form at an ordinary URL such as `/` passes. The protected-route
snapshot in `try-app-login` is the real check.

Run the crawler in the background, passing the main routes as extra start URLs:

```bash
meticulous crawl \
  --startUrl http://localhost:<port>/ \
  --startUrl http://localhost:<port>/<route-a> --startUrl http://localhost:<port>/<route-b> \
  --headless --nonInteractive --skipTestRun \
  --maxNumSessions 20 --crawlingTimeoutSeconds 600 \
  --outputFile crawl-result.json
# add --storageState <file> when the app needs a login
```

While it runs, start step 3 in parallel for flows the crawler will not reach.

## 3. Fill the gaps with targeted recordings

The crawler clicks around; it does not complete forms, multi-step flows or anything behind
specific input. Make a list of 4–10 named flows the crawl will miss, prioritising the
candidate PRs' areas, e.g. "sign up form with validation errors then success", "create item →
edit → delete", "checkout with a coupon", "settings: toggle theme and save", "search with
filters and pagination".

Split the flows across **2–3 `session-recorder` subagents launched in a single message**, each
with its own CDP port (9222, 9223, 9224) and 2–4 flows. Give each: the base URL, the port,
the flows (one session per flow, with concrete steps and any test data), and — if the app needs
a login — either the storage-state path or the credentials-file path and login route from the
login skill. They report back session ids and event counts.

## 4. Wait for ingestion

Sessions take a few minutes to ingest. Once the crawler and recorders are done:

```bash
meticulous try wait-for-sessions --min <N> --timeoutSeconds 900 --json
```

with `N` ≈ 80% of what was recorded (some short sessions are dropped). It saves the ingested
session ids to `sessions.json`, which phase 3 passes to every test run. If it times out with
fewer than 10, record more of the uncovered flows rather than continuing with thin coverage.

Then stop the local server and any backend you started for recording (phase 3 builds and
serves nothing locally).

Done when: `sessions.json` lists ≥ 15 sessions (≥ 10 at the very least). Tell the user how many
sessions you recorded and which areas they cover, in one or two lines.
