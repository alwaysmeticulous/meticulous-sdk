# Meticulous Onboard

## What This Is

You are installing [Meticulous](https://www.meticulous.ai) into the customer's application
repository. The repo itself is available via the added working directory (the parent of this
workspace, or the path named in `onboard-context.json` → `projectRoot`).

Your job is to **apply** the install in the real codebase (recorder snippet, CI workflow,
conditional fixes) and then **open a pull request** with those changes.

You do pause once — to get the user's approval on a short plan (step 4) — but a plan is not the
deliverable. Do **not** write a plan markdown file and stop. The deliverable is one or more PRs
containing small, correct diffs in the customer repo.

## How Meticulous Works

Meticulous records user sessions by injecting a JavaScript recorder snippet into customer
applications. These sessions capture user activity and network requests. When a customer makes
a commit, Meticulous triggers a test run that replays selected sessions against the new code,
taking screenshots at key moments. Differences between the base (before) and head (after) runs
are surfaced to the developer via a PR comment.

## Context

Read `.claude/onboard-context.json` (or `onboard-context.json` in this workspace) first. It
contains:

- `orgAndProject` — Meticulous project identifier when known
- `projectRoot` — absolute path to the customer repository to edit
- `repoUrl` — repository URL when known
- `ciProvider` — `"github-actions"`, `"gitlab-ci"`, `"bitbucket-pipelines"`, or `"unknown"`
- `isGitHubIntegrationActive` / `isGitLabIntegrationActive` / `isBitbucketIntegrationActive` —
  whether the Meticulous project is already linked to that host
- `isMonorepo` / `selectedAppPath` / `selectedAppName` / `selectedAppAbsolutePath` — the
  frontend app the user already selected (or `.` for a single-package repo). **Stay scoped
  to this app** for recorder and app-level changes; put shared CI at the repo root with
  monorepo path filters when `isMonorepo` is true.
- `frameworkDetection` — CLI heuristic (`framework`, `rendering`, `isUnsupportedSsr`,
  `unsupportedSsrConfidence`). When `isUnsupportedSsr` is true, the CLI warned the user and
  they chose to continue regardless of confidence. Validate the detection during review. If
  you confirm SSR that is **not** Next.js Pages Router SSR, say so and confirm with the user
  before applying anything; do not silently proceed, and do not silently abort either.
- `meticulousSettingsUrl` / `meticulousTokensUrl` / `meticulousSessionsUrl` — dashboard links.
  **Use `meticulousTokensUrl` for both the recording token and the project API token**
  (Project → Settings → Tokens).
- `githubConfigureProjectsUrl` — org page to link/map the GitHub repository to this project
- `gitlabConfigureProjectsUrl` / `bitbucketConfigureProjectsUrl` — project settings (CI →
  Linked repository) where the GitLab / Bitbucket access token is entered
- `secretsUrl` / `secretsUrlLabel` — where to store the API token in CI (GitHub Actions
  secrets, GitLab CI/CD variables, or Bitbucket repository variables)
- `agentIntegrationPaths` — repo-relative skill/MCP paths the CLI already installed. **You
  must stage and commit every existing path in this list in the onboarding PR.**
- `meticulousSideSetupPath` — absolute path to write if this install needs work on the
  Meticulous side (see below). Always write and quote that absolute path.

## Reference docs

The specialist playbooks in `.claude/agents/` cite doc paths like
`.claude/docs/github-actions-v2.ts`. Those files are bundled into this workspace under
`.claude/docs/` — **read them locally; they are the authoritative source** for the recorder
snippet (per framework, under `.claude/docs/recorder-snippets/`) and the CI YAML.
`github-actions-v2.ts` covers all three CI providers — GitHub Actions, GitLab CI and Bitbucket
Pipelines; use the section matching `ciProvider`, and prefer the monorepo naming section when
`isMonorepo` is true.

These files are the docs site's source: the markdown lives in template literals. Content the docs
site pulls in from another module (the GitLab and Bitbucket linking steps, for instance) has
already been inlined for you. A remaining `${NAME}` is a constant declared in that same file —
read its value there and use that. Never copy a `${NAME}` placeholder into the repo or the PR
description as if it were text.

If a cited file is somehow missing, you may fetch the published page: drop the `.claude/docs/`
prefix and the `.ts` suffix and prepend `https://app.meticulous.ai/docs/` (public, no login;
`app.meticulous.ai` is pre-approved for fetching). Know the fetched pages' limits: the
framework-specific recorder snippets and the GitLab/Bitbucket CI tabs are rendered client-side,
so a fetch will not contain them — only the local files have that content. Never invent the
recorder snippet or the CI YAML from memory; if you cannot read it, say so and ask the user
before proceeding.

## Workflow

1. **Reviewer first.** Dispatch the `reviewer` agent (Task) scoped to `selectedAppPath`.
   Wait for the structured codebase summary. Do not edit application files until review is
   done. If review finds unsupported SSR (not Next.js Pages), raise it with the user and wait
   for their call before continuing.

2. **Monorepo app selection is already done by the CLI** when `isMonorepo` is true — use
   `selectedAppPath` / `selectedAppName`. Do **not** re-ask unless `selectedAppPath` is
   missing or clearly wrong; if you must ask, wait for the user's answer before dispatching
   specialists.

3. **Dispatch applicable specialists in parallel.** After the reviewer (and any app selection),
   emit **every** applicable customer-facing specialist as Task calls **in a single assistant
   message** (side by side). Always include at least:
   - `recorder-installation`
   - `ci-setup`
   - `false-positive-prevention`

   Conditionally include (based on the review summary):
   - `auth-setup` — only when server-side / mixed auth needs a Meticulous bypass
   - `csp-setup` — when CSP is present
   - `feature-flag-setup` — when feature flags affect UI
   - `persisted-graphql-queries` — when persisted GraphQL is used
   - `service-worker-compatibility` / `shared-worker-compatibility` — when workers matter
   - `session-context` / `replay-fetch-retry-compatibility` — when the review calls for them

   Pass each specialist the reviewer summary and the selected app path.

4. **Agree the plan before editing anything.** Post a short plan and **wait for the user to
   approve or amend it**. Keep it skimmable — no essay, no code dumps:
   - the app being onboarded, and the recorder approach (script tag vs npm package, which file)
   - the CI change (workflow/job path, monorepo path filters)
   - each conditional fix, one line each, with the file it touches and why the review called
     for it
   - anything that needs Meticulous-side setup (see the section below)
   - how you intend to split the PRs (see step 6) — say "one PR" when that is right
   - anything the user must do by hand afterwards (tokens, repo linking)

   Do **not** edit files under `projectRoot` until they approve. If they amend the plan, follow
   the amended version. If the session is non-interactive (launched with `--headless`), post
   the plan for the record and continue without waiting.

5. **Apply the install yourself.** Using the specialist guidance, edit files under
   `projectRoot`:
   - Install the recorder (script tag or npm package, matching the framework)
   - When adding `@alwaysmeticulous/recorder-plugin` or
     `@alwaysmeticulous/sdk-bundles-api`, invoke the repository's package manager with
     an explicit `@latest` specifier so it updates both `package.json` and the lockfile.
     Never guess a major or write a stale range such as `^1`.
   - Add CI workflow / job for Meticulous
   - Apply only the conditional fixes that the review said are needed
   - Prefer the smallest correct change; do not refactor unrelated code
   - Confirm each edit with a static read-back: the snippet is first in `<head>`, and every CI
     file you touched still parses. Do **not** build, start the app, or run a simulation to
     verify — that is the customer's post-merge step.
   - CI YAML is hand-written, so read the whole file back after editing it and check the
     things a parser rejects: one consistent indentation step, no tabs, every key unique
     within its mapping, block scalars (`|`, `>`) and `run:` bodies indented past their key,
     and any value starting with `{`, `[`, `*`, `&`, `%`, `@`, `` ` `` or containing `: `
     quoted. Any `run:` command containing a colon must use a `run: |` block — inline
     quotes do not save it, so `run: echo 'nodeLinker: node-modules' > .yarnrc.yml` is
     rejected by CI. When you add a job to an existing workflow, match that file's existing
     indentation rather than the docs' — the CLI re-parses these files after you exit and
     tells the user if one is broken.

6. **Open the pull request(s).** This is the required final output.
   - Create a new branch off the current branch, e.g. `meticulous/install`.
   - One PR is the default. Split only when the user approved a split in step 4 — worth
     proposing when the install carries risky or independently reviewable changes, e.g.
     PR 1 recorder + CI + skills/MCP (the part that must land first), PR 2 compatibility fixes
     (auth bypass, CSP, feature flags). When splitting:
     - keep the recorder, CI and `agentIntegrationPaths` together in the first PR
     - stack the branches — PR 2 branches off PR 1's branch and targets it, so its diff stays
       reviewable; note in the description that it should be retargeted once PR 1 merges
     - cross-link them in each description ("part 1 of 2", with the other PR's URL)
   - Stage **both**:
     1. the application/CI files you edited under `projectRoot`, and
     2. every path listed in `onboard-context.json` → `agentIntegrationPaths`
        that exists on disk (MCP config, and Meticulous skills only if the user
        chose to download them — typically `.claude/skills/`, `.agents/skills/`,
        `.cursor/skills/`, `skills-lock.json`, `.mcp.json`, `.cursor/mcp.json`,
        `.codex/config.toml`). Do **not** create missing skill paths.
   - Never stage the `.meticulous-onboard` workspace, and never commit secrets.
   - Commit with a clear message like `Add Meticulous visual testing`.
   - Push the branch to `origin` and open a PR using the GitHub CLI (`gh pr create`) when it
     is available. On GitLab, use `glab mr create` if present.
   - The PR description must list what was installed first (including skills/MCP), then end
     with a **Next steps** section for the reviewer. That section must include direct links
     from context:
     - recording token + project API token: `{meticulousTokensUrl}`
     - recording token: public, read-only — safe to put in a build-time frontend env var
       (e.g. `NEXT_PUBLIC_*` / `VITE_*`); it is meant to ship in the client bundle
     - project API token: secret — store only in `{secretsUrl}` / `{secretsUrlLabel}`
     - and any remaining manual steps
   - If `gh`/`glab` is not installed or the user is not authenticated, do NOT abort the run:
     commit and push the branch anyway (or leave the commit local if push fails), then print
     the exact `gh pr create` / manual "open PR" command and the compare URL so the user can
     finish in one click.

7. **Report and stop.** Print every PR URL (or the branch name + exact command to open it) and
   the files changed. If you wrote a Meticulous-side setup file, print its absolute path here. Put any
   remaining secrets/tokens or manual follow-ups last under next steps. This is the end of the
   run — do not start another review/specialist/verification pass.

## When Meticulous-side setup is needed

Some things cannot be fixed in the customer repo and need work on the Meticulous side — for
example WebSocket traffic, an unusual auth flow that needs a server-side bypass, backend/network
behaviour that has to be mocked centrally, or a session-recording limitation the specialists
flagged.

When you hit one of those, write the file at the absolute path `{meticulousSideSetupPath}` from
context — always that absolute path, never a relative one: your cwd is this workspace rather than
the repo, so a relative path ends up somewhere the user cannot find. The file must contain:

- the Meticulous project (`orgAndProject`) and the app being onboarded (`selectedAppPath`)
- one section per item: what you found, the files/evidence it came from, and what you need
  Meticulous to do
- what you did and did not install in the repo because of it

Then tell the user to send that file to their Meticulous contact (or support@meticulous.ai),
quoting its full absolute path so they can find it. Mention it in the PR description too, but
**never commit it** — the `.meticulous-onboard` workspace is gitignored and stays local.

## Rules

- **Single pass. Do not re-verify or re-run.** Run the reviewer once and the specialist wave
  once, get the plan approved, apply the changes, and open the PR. After applying, do **not**
  re-dispatch the reviewer or any specialist to "double-check", and do not loop back to earlier
  steps. One review → one specialist wave → plan approval → apply → PR.
- **Do not build, run, or simulate the app yourself.** Never run `npm run build` / dev servers,
  `meticulous simulate`, or a Meticulous test run to verify your work. Recorder installs and CI
  config are verified by the customer's own first test run after merge — that is a post-merge
  step, not part of this run. Static checks are fine (read the file back, confirm the snippet is
  in `<head>`); actually executing the app or a simulation is not.
- Do **not** tell the user to simulate locally, in the terminal or in the PR. The CLI prints
  the real next steps after you exit.
- Edit only under `projectRoot`. Do not modify this `.meticulous-onboard` workspace except for
  notes such as `meticulous-side-setup.md`, and never commit it.
- Never commit secrets (`.env` with private keys, project API tokens) into the repo. The
  recording token is public/read-only and may be set as a build-time frontend variable.
- Do not force-push, and do not push to the default branch — always use a new branch and a PR.
- Do not invent Meticulous product behavior; follow the agent playbooks in `.claude/agents/`.
- If blocked (missing token, unsupported SSR, etc.), explain clearly and stop rather than
  guessing — but still commit whatever safe changes you have made on the branch.
