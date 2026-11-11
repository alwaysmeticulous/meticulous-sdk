---
name: try-app-login
description: Use during `meticulous try` when the app (or the routes that matter) sits behind a login — pick how to get signed-in recordings, pause for the user to log in or share a test account, and make every recorder and crawl reuse that login.
---

# Getting past a login

Recorded sessions capture the cookies, local storage and network responses they start with, so
**only recording needs a login** — replays and backtests reuse what was recorded. Settle this
once, before phase 2, and reuse the result in every crawl and recorder.

One exception: when the app's **server** verifies a short-lived session token on every request
(server-rendered pages behind Clerk, Auth0, Supabase, Firebase, NextAuth JWTs, …), a replay hours
later sends the recorded, expired token, and the server redirects to a login or loops trying to
refresh it. Phase 3 checks for this; the fix is usually a trial-only replay fix that accepts the
recorded token (e.g. a clock-skew allowance or a local JWT key, switched on by an env var only
the trial build sets).

## 1. Look for a way in that needs nothing from the user

Spend ≤ 3 minutes on the repo before asking (read, do not edit tracked files):

- **Auth disabled or mocked in dev**: env flags such as `AUTH_DISABLED`, `SKIP_AUTH`,
  `NEXT_PUBLIC_MOCK_AUTH`, an MSW / mirage handler for the session endpoint, a "dev login" or
  "login as" route, a local backend that seeds a user (`seed` scripts, fixtures, README/
  CONTRIBUTING test credentials). If one works, put it in the recipe (env var names, or the
  seed step in `notes`) and you are done.
- **Public routes**: if the candidate PRs only touch pages that render signed out, record those
  and skip the login.

## 2. Otherwise, choose a mechanism and pause for the user

Pick by how the app keeps its session — check the login code (where the token goes after
sign-in) and the auth library (`next-auth`, Auth0, Clerk, Supabase, Firebase, Cognito, a
custom `fetch` wrapper):

| The app keeps its session in                                                                   | Use                                                                                   |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Cookies and/or local storage (most apps: session cookies, JWT in `localStorage`, Auth0, Clerk) | **A — browser login** (default)                                                       |
| Session storage or IndexedDB (Firebase Auth, some OIDC clients), or very short-lived tokens    | **B — test-account credentials**, typed into each recording                           |
| A bearer token the user can copy (an API key or JWT the app reads from storage or env)         | **C — token**: user puts it where the app reads it; save as storage state or env name |

A also suits SSO, magic links and MFA: the user does the hard part once, and you never see a
password. If A captures nothing usable (step 3 fails), fall back to B.

In a non-interactive run nobody can log in: write what you need to `needs-input.md` and carry
on with signed-out pages. Otherwise, whatever you choose, ask the user **once**, in one message that says what you found, which
mechanism and why, and exactly what they must do. Always ask for a **test or staging account,
never their personal one**: what they log in with ends up in the trial project's recordings.

### A — browser login (`meticulous try login`)

The login has to happen against the app **as you serve it** (`http://localhost:<port>`), since
cookies and local storage are per origin. If the identity provider will not redirect back to
localhost (OAuth callback allow-lists), say so and switch to B or C.

Tell the user, then run in the background (Bash `run_in_background`) and wait for it to exit:

> A browser window is opening at `http://localhost:<port>/<login-route>`. Please log in with a
> **test account**, wait until the app shows you are signed in, then close the window.

```bash
meticulous try login --url http://localhost:<port>/<login-route> --json
```

It saves cookies and local storage (Playwright storage-state format, owner-readable only) to
`auth/storage-state.json` (`paths.authState`) and prints only cookie domains and storage key
**names**. Never print or read out the values. Exit code 1 means nothing was captured — ask the
user whether they finished logging in, or switch to B.

### B — test-account credentials

Ask the user to write them to `auth/credentials.env` in this workspace (gitignored, outside the
repo), e.g. `TRY_LOGIN_EMAIL=…` / `TRY_LOGIN_PASSWORD=…`, rather than pasting them into the
chat. Read it only to type the values into the login form; never echo them, write them into a
recipe, or pass them on a command line other than to the browser.

Each `session-recorder` then starts at the login page and signs in as the first steps of every
flow; the login becomes part of the session, which is what replays need. The crawler cannot
type credentials, so with B it only covers signed-out pages: lean on more recorder flows
(phase 2 step 3) for the signed-in ones.

### C — token

If the app reads the token from an env var at build or serve time, have the user write it to
`auth/credentials.env`, source that file in the build/serve command, put only the var's
**name** in the recipe, and rebuild. If the app reads it from storage or a "paste your token" field, run
`meticulous try login` and have them paste it there, then treat it like A.

## 3. Verify before recording anything

With A or C, start one recorder with the saved state and confirm a protected route renders
signed in (with B, the first `session-recorder` flow is the check):

```bash
meticulous try free-port    # <cdpPort>
meticulous record session --remoteDebuggingPort <cdpPort> --headless --storageState auth/storage-state.json \
  --appUrl http://localhost:<port>/<protected-route>    # background
agent-browser --cdp <cdpPort> wait 3000 && agent-browser --cdp <cdpPort> snapshot -i
lsof -ti tcp:<cdpPort> -sTCP:LISTEN | xargs kill
```

If it shows the login page, the state is wrong (wrong origin, expired, or kept in session
storage/IndexedDB) — retry A once, then fall back to B. Do not record sessions that are stuck
on a login wall.

## 4. Use it everywhere

- Crawler: `meticulous crawl … --storageState auth/storage-state.json` (local storage applies to
  the first `--startUrl`'s origin, so make that the app).
- Recorders: pass the storage-state path (A/C) or the credentials file path (B) to every
  `session-recorder`; they add `--storageState` to `meticulous record session`.
- Tell the user in one line which mechanism you used. `meticulous try cleanup --keepWorkspace` deletes the saved
  login state at the end; also delete `auth/credentials.env` if you created one.
