---
name: try-build-and-serve
description: Phase 1 of `meticulous try` — work out how to install, build and serve the user's app (and where its API calls go), prove it renders real content on localhost, and save a reusable build recipe for every later build.
---

# Phase 1 — Build & serve

Goal: the app running at `http://localhost:<port>` rendering **real content**, plus a saved
recipe that rebuilds it at any commit with no rediscovery. Budget: aim for ≤ 10 minutes.

## 1. Read before running anything (2 minutes, in parallel)

Read these in one batch from `projectRoot` (and the app directory in a monorepo):

- `package.json` scripts (`build`, `preview`, `start`, `dev`, `export`), `engines`,
  `packageManager`; lockfile; `.nvmrc` / `.node-version` / `.tool-versions`
- framework config: `vite.config.*`, `next.config.*`, `angular.json`, `nuxt.config.*`,
  `svelte.config.*`, `webpack.config.*`, `remix.config.*`, `astro.config.*`
- `.env.example` / `.env.sample` / `.env.development` / `.env*.local` names (not values),
  `README` / `CONTRIBUTING` setup sections, `Dockerfile` / `docker-compose.*`, CI workflows
  (`.github/workflows/*`, `.gitlab-ci.yml`) — CI shows the exact build command and required env.

In a monorepo with `selectedApp: null`, pick the user-facing web app (the one with routes/pages
and the most UI code, not docs/storybook/admin tooling) and say which you chose and why.

Start `meticulous try candidate-prs --json --limit 15` now too (pure git, seconds) — its file
lists show which app directory the recent PRs actually touch.

## 2. Choose the build kind

Prefer a **static** build whenever the app can be served as files:

| App                                                                   | Build                                          | Output dir                             |
| --------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| Vite / CRA / webpack SPA                                              | `<pm> run build`                               | `dist/` or `build/`                    |
| Angular                                                               | `ng build` (via the script)                    | `dist/<name>/browser` or `dist/<name>` |
| Next.js with `output: 'export'`, or pages that are all static         | `next build` (+ `next export` on old versions) | `out/`                                 |
| Vue / Svelte / Solid SPA, SvelteKit with adapter-static, Astro static | the build script                               | the adapter's output                   |

Fall back to a **container** only when the app needs a server at runtime (Next.js SSR/App
Router with server rendering, Remix, Nuxt SSR, SvelteKit node adapter, full-stack apps). Use
the repo's `Dockerfile` if it has one; otherwise write one under `.meticulous-try/` (never in
the repo) and build with `-f`. Container builds must tag the image `$TRY_IMAGE_TAG`, e.g.
`docker build -t "$TRY_IMAGE_TAG" -f .meticulous-try/Dockerfile .`.

**In a monorepo, scope `buildCmd` to the selected app** and its dependency closure — never the
whole workspace: `pnpm --filter <app>... build`, `turbo run build --filter=<app>...`,
`nx build <app>`, `yarn workspace <app> run build` or `npm run build -w <app>`. The backtests
rebuild at ~20 commits, so every unrelated package in `buildCmd` is paid for ~20 times. Verify
the scoped command actually produces `outputDir` before saving it, and put the filter you chose
in `notes`.

**If the build tool keeps a content-hash-keyed cache that an env var can relocate** — Turborepo
(`turbo.json` → `TURBO_CACHE_DIR`), Nx (`nx.json` → `NX_CACHE_DIRECTORY`) — record it in the
recipe's `cacheEnv` (see step 5) so every worktree's builds share one cache; a commit already
built on either side of a backtest then rebuilds for free. Only use env vars whose cache is
keyed by content hashes; never relocate an mtime-based cache this way.

Never change the app's source or config to make it build. If it needs a flag, pass it on the
command line or via env.

### If the app already has Meticulous installed

Check for an existing Meticulous integration: a `snippet.meticulous.ai` script tag or
`data-recording-token` attribute, `@alwaysmeticulous/recorder-loader` /
`tryLoadAndStartRecorder`, or `@alwaysmeticulous/recorder-plugin` in a bundler config. If you
find one, **disable it in every build** so the trial tests Meticulous from scratch — otherwise it
records into the user's real Meticulous project and conflicts with the trial's recorder.

- Prefer a switch the app already has: most integrations only load when a recording-token env
  var is set or outside some environment, so leave that var unset or set the gating var in the
  build command.
- Otherwise, prefix `buildCmd` with a step that strips it from the **checkout being built**
  (e.g. a `sed` that removes the script tag or the `tryLoadAndStartRecorder` call). This is the
  one allowed edit to app files, and only ever in a worktree — never in `projectRoot`.
  Because it lives in `buildCmd`, every backtest build gets it too. In that case do this phase's
  own build in a worktree as well (`meticulous try worktree --sha HEAD --name slot-0` — that
  name makes it the first warm worktree the backtesters' build slots lease), not from
  `projectRoot`.

Say in `notes` how you disabled it, and verify in phase 2 that only the trial recorder loads
(no request to the user's own recording token).

## 3. Work out where API calls go

Look at how the app picks its API origin (`VITE_*`/`NEXT_PUBLIC_*`/`REACT_APP_*` vars, a
`config.ts`, proxy settings in the dev server config, hard-coded URLs, GraphQL endpoints).
Decide one `backend.mode`:

- `remote` — the app already points at a public/staging API that answers without secrets
  (best case: recordings capture real responses).
- `local` — a backend in the repo that starts with one command (`docker compose up`, a `dev`
  script) without external secrets. Start it in the background.
- `mocked` — the repo ships mocks (MSW, mirage, fixtures) that can be enabled by env.
- `none` — purely static content.

Recorded sessions capture network responses, so replays never need the backend again — the
backend only matters while recording. If the app cannot show real content without secrets, ask
the user, once, precisely: which env var names, and what you already tried. If it needs a
login, note where the session is kept (cookies, local storage, …) and follow
`.claude/skills/try-app-login/SKILL.md` once the app is serving (step 4).

## 4. Build, serve, verify

1. Install from the repo root: `<pm> install --frozen-lockfile` (pnpm/yarn), `npm ci`, or
   `bun install --frozen-lockfile`. Use the Node version the repo pins if it differs and is
   available (`node --version`). This install pays off twice: every worktree created later
   starts by copying `node_modules` from an existing checkout, so it is usually the seed for
   all backtest builds.
2. Build. Time it — later phases rebuild per commit, so note anything slow.
3. Serve the build **in the background** (Bash `run_in_background`) on a fixed free port
   (check with `lsof -ti tcp:<port>`):
   - static: `npx --yes serve -s <outputDir> -l <port>` (SPA fallback on), or the framework's
     `preview` script if it serves the build output
   - container: `docker run -d --rm --name try-app -p <port>:<containerPort> "$TRY_IMAGE_TAG"`
4. Verify it renders real content, not a shell or an error page:
   `curl -sf http://localhost:<port>/ | head -c 2000`, then one or two deep routes. For SPAs the
   HTML is a shell, so confirm in phase 2's first browser snapshot that the page shows real UI
   and no error overlay or blank screen. Fix and re-verify before moving on.

Keep this server running: phase 2 records against it.

## 5. Save the recipe

Write `build-recipe.input.json` in this workspace and save it:
`meticulous try recipe save --file build-recipe.input.json`.

```json
{
  "kind": "static",
  "appDir": "apps/web",
  "installCmd": "pnpm install --frozen-lockfile",
  "buildCmd": "pnpm --filter web build",
  "outputDir": "apps/web/dist",
  "serveCmd": "npx --yes serve -s apps/web/dist -l 4173",
  "port": 4173,
  "containerPort": null,
  "healthCheckPath": null,
  "envVarNames": ["VITE_API_URL"],
  "cacheEnv": { "TURBO_CACHE_DIR": "turbo" },
  "backend": {
    "mode": "remote",
    "notes": "VITE_API_URL defaults to https://api.staging.example.com in .env.production; no auth needed for public pages"
  },
  "notes": "Build takes ~45s. Node 20."
}
```

All commands run from the repository (or worktree) root; paths are repo-relative. For a
container: `"kind": "container"`, `outputDir: null`, `buildCmd` tagging `$TRY_IMAGE_TAG`,
`containerPort` set, `healthCheckPath` if the app has one. `envVarNames` holds **names only**
— the validator rejects anything else. `cacheEnv` maps a cache-relocating env var to a path
relative to the shared cache dir (step 2); leave it `{}` when the build tool has none.
`meticulous try recipe show` adds a `cacheEnvResolved` field with the absolute, already-created
paths — export those around every install and build. Put anything a backtester must know (slow steps, a required env
var, a monorepo filter) in `notes`.

Done when: the app serves real content at `http://localhost:<port>` and `meticulous try recipe
show` prints the recipe. Tell the user the build kind, port and backend mode in one line.
