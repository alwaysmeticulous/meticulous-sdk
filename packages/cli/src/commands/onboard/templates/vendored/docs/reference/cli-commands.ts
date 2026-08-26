import {
  AGENT_REVIEW_DOCS_URL,
  AGENTS_CLI_COMMANDS_URL,
  FAQ_AND_TROUBLESHOOTING_URL,
  GITHUB_ACTIONS_SETUP_URL,
  TUNNEL_ADVANCED_OPTIONS_URL,
} from "src/lib/utils/internal-urls/docs-urls.utils";

export const document = `---
{
  "title": "CLI Commands Reference"
}
---

# {% $frontmatter.title %}

Complete reference for Meticulous CLI commands, flags, and usage patterns.

---

## Installation

Install the CLI globally or use npx:

\`\`\`bash
# Using npx (recommended)
npx @alwaysmeticulous/cli [command]

# Or install globally
npm install -g @alwaysmeticulous/cli
meticulous [command]
\`\`\`

---

## Commands Overview

| Command | Purpose | Use Case |
|---------|---------|----------|
| \`onboard\` | Install Meticulous using local Claude Code or Codex | Initial recorder and CI setup |
| \`ci run-with-tunnel\` | Run tests in cloud via tunnel | CI testing with local app |
| \`ci upload-assets\` | Upload and test static assets | CI testing for static sites |
| \`ci upload-asset-chunk\` | Upload one named, versioned asset chunk | Multi-bundle deployments |
| \`ci run-with-uploaded-asset-chunks\` | Trigger a test run against uploaded chunks | Multi-bundle deployments |
| \`ci upload-container\` | Upload Docker container and test | CI testing with containers |
| \`ci agent-test\` | Upload a build and launch an agent to explore the PR | Beta, opt-in Agent review |
| \`ci run-local\` | Run all replay test cases locally | Local test execution |
| \`ci prepare\` | Ensure base run exists | CI setup |
| \`ci label-commit\` | Attach labels to a commit | Marking commits as not relevant for testing |
| \`ci start-tunnel\` | Start secure tunnel | Manual testing/debugging |
| \`simulate\` (alias: \`replay\`) | Replay session locally | Local debugging |
| \`record session\` | Record a user session | Session recording |
| \`record login\` | Record a login flow | Login flow recording |
| \`crawl\` | Crawl your app to record sessions and create a test run | Bootstrapping session coverage |
| \`auth login\` | Force a fresh browser login and select a project | Authentication |
| \`auth whoami\` | Show current user | Authentication check |
| \`auth logout\` | Clear stored tokens | Authentication |
| \`auth get-project\` | Print your default project | Authentication |
| \`auth set-project\` | Choose your default project | Authentication |
| \`auth list-projects\` | List the projects you can access | Authentication |
| \`project show\` | Show linked project | Project info |
| \`project upload-source\` | Upload a source-code archive for a given commit | Source coverage / CI |
| \`download session\` | Download a recorded session | Debugging |
| \`download replay\` | Download a replay | Debugging |
| \`download test-run\` | Download a test run | Debugging |
| \`local relevant-sessions\` | Find sessions covering the current branch's code changes | Local development |
| \`debug replay\` | Set up a debug workspace for a single replay | Investigating a replay |
| \`debug replay-diff\` | Set up a debug workspace for a specific replay diff | Investigating a diff |
| \`debug clean\` | Clean up debug workspaces | Debug workspace maintenance |
| \`agent upload-build\` | Upload a build (static assets or container) and capture a deployment ID | Agent/programmatic use |
| \`agent trigger-test-run\` | Trigger a test run against an uploaded build | Agent/programmatic use |
| \`agent test-run-diffs\` | List replay diffs for a test run with summary | Agent/programmatic use |
| \`agent diff-comments\` | Get review comments for a replay-diff screenshot | Agent/programmatic use |
| \`agent reject-diff\` | Agent-reject a screenshot diff and comment why | Agent/programmatic use |
| \`agent ignore-diff\` | Agent-ignore a screenshot diff and comment why | Agent/programmatic use |
| \`agent create-diff-comment\` | Start a review comment thread on a screenshot diff | Agent/programmatic use |
| \`agent reply-to-diff-comment\` | Reply to a review comment thread | Agent/programmatic use |
| \`agent dom-diff\` | Get the DOM diff for a replay-diff screenshot | Agent/programmatic use |
| \`agent image-urls\` | Get screenshot image URLs for a replay-diff screenshot | Agent/programmatic use |
| \`agent image-files\` | Download screenshot images to \`~/.meticulous/agent-images\` | Agent/programmatic use |
| \`agent timeline-diff\` | Get the timeline diff for a replay diff | Agent/programmatic use |
| \`agent test-run-check\` | Get a builtin or custom non-visual check report for a test run, or list available check IDs with \`--availableIds\` | Agent/programmatic use |
| \`agent test-run-for-commit\` | Look up the latest test run for a commit (defaults to git HEAD) | Agent/programmatic use |
| \`agent sessions\` | List a project's most recently recorded sessions, newest first | Agent/programmatic use |
| \`agent js-coverage\` | Get JS coverage for a replay or a whole test run | Agent/programmatic use |
| \`agent js-coverage-diff\` | Get the JS coverage diff (base vs head) for a replay diff | Agent/programmatic use |
| \`agent upload-build\` | Upload a build (static assets or container) and capture a deployment ID | Agent/programmatic use |
| \`agent trigger-test-run\` | Trigger a test run against an uploaded build | Agent/programmatic use |
| \`agent complete-base-run\` | Replay the selected sessions a base run has not run yet | Agent/programmatic use |
| \`agent submit-feedback\` | Submit free-form feedback about Meticulous to the Meticulous team | Agent/programmatic use |
| \`schema\` | Print the CLI command schema as JSON | Agent/programmatic use |

For a closer look at the \`agent\` and \`auth\` commands — including their flags and how they compose into agent workflows — see [CLI commands for agents](${AGENTS_CLI_COMMANDS_URL}).

---

## onboard

Install Meticulous in the current Git repository using your local Claude Code
or Codex. The command reviews the frontend application and prepares a pull
request with recorder and CI configuration. Model inference runs through your
own coding-agent account, not Meticulous-hosted inference.

### Authentication

If you are not already logged in, \`onboard\` opens a browser to sign in and
then selects the Meticulous project. On a remote or sandboxed machine, run
\`npx @alwaysmeticulous/cli auth login --device\` first. Alternatively, pass
\`--apiToken\`.

### Examples

\`\`\`bash
# Interactive setup from the connected application repository
npx @alwaysmeticulous/cli onboard --project="<ORGANIZATION>/<PROJECT>"

# Choose an app in a monorepo and use Claude Code
npx @alwaysmeticulous/cli onboard \\
  --project="<ORGANIZATION>/<PROJECT>" \\
  --app="apps/web" \\
  --agent=claude

# Prepare the workspace without launching an agent
npx @alwaysmeticulous/cli onboard --printOnly
\`\`\`

Key options include \`--cwd\`, \`--project\`, \`--app\`, \`--agent\`,
\`--model\`, \`--headless\`, \`--auto\`, \`--printOnly\`, and
\`--apiToken\`.

---

## ci run-with-tunnel

Run Meticulous tests in the cloud against a locally-running application.

### Synopsis

\`\`\`bash
npx @alwaysmeticulous/cli ci run-with-tunnel \\
  --apiToken="<token>" \\
  --appUrl="<url>" \\
  [options]
\`\`\`

### Required Flags

#### \`--apiToken\`

**Type**: String
**Description**: Your Meticulous API token
**How to get**: From Meticulous dashboard project settings

**Example**:
\`\`\`bash
--apiToken="met_live_abc123..."
\`\`\`

**Note**: Can also be set via \`METICULOUS_API_TOKEN\` environment variable.

---

#### \`--appUrl\`

**Type**: String
**Description**: URL where your app is running
**Format**: Full URL including protocol and port

**Examples**:
\`\`\`bash
--appUrl="http://localhost:3000"
--appUrl="http://localhost:8080"
--appUrl="https://localhost:3000"
\`\`\`

---

### Optional Flags

#### \`--commitSha\`

**Type**: String
**Description**: Commit SHA being tested
**Default**: Auto-detected from git

**Example**:
\`\`\`bash
--commitSha="$GITHUB_SHA"
--commitSha="abc123def456..."
\`\`\`

---

#### \`--companionAssetsFolder\`

**Type**: String (path)
**Description**: Path to local folder with static assets to upload
**Default**: None
**Requires**: Must also provide \`--companionAssetsRegex\`

**Example**:
\`\`\`bash
--companionAssetsFolder="companion-assets"
\`\`\`

---

#### \`--companionAssetsRegex\`

**Type**: String (regex)
**Description**: Regex pattern for requests to serve from companion assets
**Default**: None
**Requires**: Must also provide \`--companionAssetsFolder\`

**Example**:
\`\`\`bash
--companionAssetsRegex="^/_next/static/"
\`\`\`

---

#### \`--proxyAllUrls\`

**Type**: Boolean
**Description**: Proxy all URLs through tunnel (not just app URL)
**Default**: false

**Example**:
\`\`\`bash
--proxyAllUrls
\`\`\`

**Use case**: Multi-server applications (frontend + API on different ports)

---

#### \`--rewriteHostnameToAppUrl\`

**Type**: Boolean
**Description**: Rewrite request hostname to match app URL
**Default**: false

**Example**:
\`\`\`bash
--rewriteHostnameToAppUrl
\`\`\`

**Use case**: When HTML contains absolute URLs

---

#### \`--secureTunnelHost\`

**Type**: String
**Description**: Custom tunnel server host
**Default**: Meticulous production tunnel
**Note**: For Meticulous team use only

---

#### \`--hadPreparedForTests\`

**Type**: Boolean
**Description**: Indicate that \`meticulous ci prepare\` was already run
**Default**: false

---

### Complete Example

\`\`\`bash
# Basic usage
npx @alwaysmeticulous/cli ci run-with-tunnel \\
  --apiToken="$METICULOUS_API_TOKEN" \\
  --appUrl="http://localhost:3000"

# With companion assets (Next.js)
npx @alwaysmeticulous/cli ci run-with-tunnel \\
  --apiToken="$METICULOUS_API_TOKEN" \\
  --appUrl="http://localhost:3000" \\
  --companionAssetsFolder="companion-assets" \\
  --companionAssetsRegex="^/_next/static/"

# Multi-server app
npx @alwaysmeticulous/cli ci run-with-tunnel \\
  --apiToken="$METICULOUS_API_TOKEN" \\
  --appUrl="http://localhost:3000" \\
  --proxyAllUrls
\`\`\`

---

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success - all tests passed or diffs approved |
| 1 | Failure - tests failed or unapproved diffs |
| 2 | Error - configuration or connection error |

---

## ci agent-test

{% callout type="info" title="Beta opt-in" %}
Agent review is currently in beta and is not available to every customer. Your Meticulous project must be explicitly enabled before this command can launch. [Set up Agent review](${AGENT_REVIEW_DOCS_URL}) explains how to request access and configure the workflow.
{% /callout %}

Upload one build target and launch a Meticulous-hosted agent that explores the pull request and creates additional recorded sessions.

### Synopsis

\`\`\`bash
npx @alwaysmeticulous/cli ci agent-test \\
  --assetsDir="<path-to-built-assets>" \\
  --commitSha="<pr-head-sha>" \\
  [options]
\`\`\`

Provide exactly one target:

- \`--assetsDir\` — a built static frontend directory.
- \`--assetsUploadId\` — an existing uploaded-assets build.
- \`--localImageTag\` — a locally built Docker image.

Use \`--instructionsFile\` to give the agent routes and flows to exercise. With an uploaded frontend, \`--backendUrl\` proxies configured relative paths (\`--backendProxyPaths\`, default \`/api\`) to a public HTTPS staging backend. It cannot be combined with \`--enableLocalMocks\`. If the frontend calls other hosts with absolute URLs, pass them as repeatable \`--trustedOrigins https://…\` values (HTTPS origins only; uploaded assets only). Those hosts must allow CORS from the app origin (\`http://localhost:8000\` by default, overridable with \`--appPort\`); cookie sessions need \`SameSite=None; Secure\`.

For a pull request workflow, pass \`github.event.pull_request.head.sha || github.sha\` as \`--commitSha\`, rather than only \`github.sha\`. Use \`--dryRun\` to validate options without launching an agent.

---

## ci upload-assets

Upload static assets and run tests in the cloud.

### Synopsis

\`\`\`bash
npx @alwaysmeticulous/cli ci upload-assets \\
  --apiToken="<token>" \\
  --appDirectory="<path>" \\
  [options]
\`\`\`

### Required Flags

#### \`--apiToken\`

**Type**: String
**Description**: Your Meticulous API token

---

#### \`--appDirectory\`

**Type**: String (path)
**Description**: Path to directory containing built static assets
**Common values**: \`dist\`, \`build\`, \`out\`

**Examples**:
\`\`\`bash
--appDirectory="dist"        # Vite
--appDirectory="build"       # Create React App
--appDirectory="out"         # Next.js static export
\`\`\`

---

### Optional Flags

#### \`--commitSha\`

**Type**: String
**Description**: Commit SHA being tested
**Default**: Auto-detected from git

---

#### \`--rewrites\`

**Type**: String (JSON)
**Description**: URL rewrite rules in Vercel format
**Use case**: SPA routing, redirects

**Example**:
\`\`\`bash
--rewrites='[{"source":"/(.*)", "destination":"/index.html"}]'
\`\`\`

**Common patterns**:

**SPA routing**:
\`\`\`json
[{"source": "/(.*)", "destination": "/index.html"}]
\`\`\`

**API proxy**:
\`\`\`json
[{"source": "/api/(.*)", "destination": "https://api.example.com/$1"}]
\`\`\`

---

#### \`--waitForBase\`

**Type**: Boolean
**Description**: Wait for base test run
**Default**: false

---

#### \`--waitForTestRunToComplete\`

**Type**: Boolean
**Description**: After the upload succeeds and Meticulous has started a test run, keep polling until that run reaches a terminal status, then exit non-zero if the run failed.

**Default**: false (omit the flag)

**Standard CI setups should leave this flag off.** For GitHub, GitLab, Buildkite, CircleCI, and similar pipelines, the usual pattern is: build, run \`ci upload-assets\` (or \`ci upload-container\`) to upload and trigger a run, then let the job exit. Meticulous reports progress and outcomes on the pull request or through your VCS integration. Holding the whole CI job open until every replay finishes makes pipelines slower, rarely adds value, and tooling (including some AI code reviewers) often suggests this flag because the name sounds helpful.

**Why avoid it by default:** the run can still have background work in some configurations (for example lazy session execution), so a naive "wait until complete" loop may exit too early or fail with errors that are hard to interpret if you were only trying to "wait for Meticulous."

**When it may be appropriate:** automation that deliberately must block until the run is fully finished (for example internal regression checks where the process relies on the CLI exit code). If you are onboarding a new project or wiring PR checks, you almost never need this flag.

---

### Complete Example

\`\`\`bash
# Basic usage
npx @alwaysmeticulous/cli ci upload-assets \\
  --apiToken="$METICULOUS_API_TOKEN" \\
  --appDirectory="dist"

# With SPA routing
npx @alwaysmeticulous/cli ci upload-assets \\
  --apiToken="$METICULOUS_API_TOKEN" \\
  --appDirectory="dist" \\
  --rewrites='[{"source":"/(.*)", "destination":"/index.html"}]'

# With commit SHA
npx @alwaysmeticulous/cli ci upload-assets \\
  --apiToken="$METICULOUS_API_TOKEN" \\
  --appDirectory="build" \\
  --commitSha="$CI_COMMIT_SHA"
\`\`\`

---

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Failure |
| 2 | Error |

---

## ci upload-asset-chunk

Upload a named, versioned chunk of static assets to Meticulous for incremental deployments.

### Synopsis

\`\`\`bash
npx @alwaysmeticulous/cli ci upload-asset-chunk \\
  --apiToken="<token>" \\
  --chunkName="<name>" \\
  --chunkVersionId="<version>" \\
  --chunkAssetsDirectory="<path>" \\
  [options]
\`\`\`

### Required Flags

#### \`--apiToken\`

**Type**: String
**Description**: Your Meticulous API token

**Note**: Can also be set via \`METICULOUS_API_TOKEN\` environment variable.

---

#### \`--chunkName\`

**Type**: String
**Description**: Logical name of the asset chunk (e.g. \`app\`, \`vendor\`).

**Example**:
\`\`\`bash
--chunkName="app"
\`\`\`

---

#### \`--chunkVersionId\`

**Type**: String
**Description**: Version identifier for this chunk (e.g. content hash or build id). Chunks are deduped by (chunkName, chunkVersionId).

**Example**:
\`\`\`bash
--chunkVersionId="$CI_COMMIT_SHA"
\`\`\`

---

#### \`--chunkAssetsDirectory\`

**Type**: String (path)
**Description**: Directory whose contents should be packaged into this chunk.

**Example**:
\`\`\`bash
--chunkAssetsDirectory="dist"
\`\`\`

---

### Optional Flags

#### \`--chunkAssetsDirectoryPrefix\`

**Type**: String
**Description**: Path prefix prepended to every entry in the chunk (e.g. \`static/assets\`). Files in \`chunkAssetsDirectory\` will be served under this prefix at replay time.

**Example**:
\`\`\`bash
--chunkAssetsDirectoryPrefix="static/assets"
\`\`\`

---

#### \`--commitSha\`

**Type**: String
**Description**: Commit SHA being tested
**Default**: Auto-detected from git

---

#### \`--force\`

**Type**: Boolean
**Description**: Re-upload even if a chunk with the same \`--chunkName\` and \`--chunkVersionId\` is already marked as uploaded on the server. Use only for recovery (e.g., a corrupted S3 object). The server will overwrite the existing chunk; downstream test runs that already referenced the old bytes will resolve to the new ones.
**Default**: \`false\`

**Example**:
\`\`\`bash
--force
\`\`\`

---

### Complete Example

\`\`\`bash
npx @alwaysmeticulous/cli ci upload-asset-chunk \\
  --apiToken="$METICULOUS_API_TOKEN" \\
  --chunkName="app" \\
  --chunkVersionId="$CI_COMMIT_SHA" \\
  --chunkAssetsDirectory="dist"
\`\`\`

---

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Failure |
| 2 | Error |

---

## ci run-with-uploaded-asset-chunks

Trigger a test run against already-uploaded asset chunks. Pair with \`ci upload-asset-chunk\`.

### Synopsis

\`\`\`bash
npx @alwaysmeticulous/cli ci run-with-uploaded-asset-chunks \\
  --apiToken="<token>" \\
  --commitSha="<sha>" \\
  --assetReferencesManifest="<path>" \\
  [options]
\`\`\`

### Required Flags

#### \`--apiToken\`

**Type**: String
**Description**: Your Meticulous API token

---

#### \`--assetReferencesManifest\`

**Type**: String (path)
**Description**: Path to a JSON file containing a list of references to previously uploaded asset chunks (see \`ci upload-asset-chunk\`). Each entry is either \`{ name, versionId }\` (an explicit chunk version) or \`{ name, versionLookup: "latest-in-history" }\` (resolves the version of an unchanged chunk from the base test run's history; the base is inferred automatically for GitHub projects, or pass \`--baseSha\` to override it). Chunk names must be unique. Chunked analog of \`--appDirectory\` / \`--appZip\` on \`ci upload-assets\`.

**File format**:
\`\`\`json
[
  { "name": "app", "versionId": "ad8a8da9aaaweaad9" },
  { "name": "plugin-1", "versionLookup": "latest-in-history" }
]
\`\`\`

**Example**:
\`\`\`bash
--assetReferencesManifest="./manifest.json"
\`\`\`

---

### Optional Flags

#### \`--commitSha\`

**Type**: String
**Description**: Commit SHA being tested
**Default**: Auto-detected from git

---

#### \`--baseSha\`

**Type**: String
**Description**: The base commit SHA to compare against. Intended for custom test run triggers. Cannot be combined with \`--repoDirectory\`.

---

#### \`--gitDiffOutput\`

**Type**: String
**Description**: Raw git diff output between the base and head commits. Requires \`--baseSha\`. Cannot be combined with \`--repoDirectory\`.

---

#### \`--repoDirectory\`

**Type**: String (path)
**Description**: The path to a git repository. Intended for custom test run triggers. Automatically infers \`--commitSha\`, \`--baseSha\`, and \`--gitDiffOutput\` from the repo. Cannot be combined with \`--commitSha\`, \`--baseSha\`, or \`--gitDiffOutput\`.

---

#### \`--rewrites\`

**Type**: String (JSON)
**Description**: URL rewrite rules in Vercel \`serve-handler\` format.
**Default**: \`'[]'\` (falls back to \`{ source: "**", destination: "/index.html" }\`)

**Example**:
\`\`\`bash
--rewrites='[{"source":"/(.*)", "destination":"/index.html"}]'
\`\`\`

---

#### \`--sessionFilter\`

**Type**: String (path)
**Description**: Path to a JSON file restricting which sessions the test run replays. A session is replayed if its start URL matches at least one of the regexes ([RE2 syntax](https://github.com/google/re2/wiki/Syntax)). If omitted, all selected sessions are replayed. See [Filter Sessions by Start URL](/docs/how-to/filter-sessions-by-start-url).

**File format**:
\`\`\`json
{
  "session-start-url-matches-any-regex": ["/checkout/", "/settings/"]
}
\`\`\`

**Example**:
\`\`\`bash
--sessionFilter="./session-filter.json"
\`\`\`

---

#### \`--waitForBase\`

**Type**: Boolean
**Description**: If true, wait for a base test run to be created before triggering a test run.
**Default**: \`true\`

---

#### \`--waitForTestRunToComplete\`

**Type**: Boolean
**Description**: Block until the triggered test run finishes. Only for runs tied to a local branch: requires \`--repoDirectory\`, or both \`--baseSha\` and \`--gitDiffOutput\`. Implies \`--waitForBase\`.
**Default**: \`false\`

---

#### \`--dryRun\`

**Type**: Boolean
**Description**: Print what would be triggered without making the API call.
**Default**: \`false\`

---

### Complete Example

\`\`\`bash
# manifest.json
# [
#   { "name": "app", "versionId": "ad8a8da9aaaweaad9" },
#   { "name": "plugin-1", "versionId": "dd8ffdaa9dfedebb3" }
# ]

npx @alwaysmeticulous/cli ci run-with-uploaded-asset-chunks \\
  --apiToken="$METICULOUS_API_TOKEN" \\
  --commitSha="$CI_COMMIT_SHA" \\
  --assetReferencesManifest="./manifest.json"
\`\`\`

---

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Failure |
| 2 | Error |

---

## simulate

Replay a session locally for debugging.

### Synopsis

\`\`\`bash
npx @alwaysmeticulous/cli simulate \\
  --sessionId="<id>" \\
  --appUrl="<url>" \\
  [options]
\`\`\`

### Required Flags

#### \`--sessionId\`

**Type**: String
**Description**: ID of session to replay
**How to get**: From Meticulous dashboard or test run

**Example**:
\`\`\`bash
--sessionId="ses_abc123..."
\`\`\`

---

#### \`--appUrl\`

**Type**: String
**Description**: URL where your app is running locally

**Example**:
\`\`\`bash
--appUrl="http://localhost:3000"
\`\`\`

---

### Optional Flags

#### \`--apiToken\`

**Type**: String
**Description**: Your Meticulous API token
**Note**: Required if session is private

---

#### \`--headless\`

**Type**: Boolean
**Description**: Run browser in headless mode
**Default**: false

**Example**:
\`\`\`bash
--headless
\`\`\`

---

#### \`--devtools\`

**Type**: Boolean
**Description**: Open browser DevTools automatically
**Default**: false

**Example**:
\`\`\`bash
--devtools
\`\`\`

---

### Complete Example

\`\`\`bash
# Basic replay
npx @alwaysmeticulous/cli simulate \\
  --sessionId="ses_abc123..." \\
  --appUrl="http://localhost:3000"

# With DevTools for debugging
npx @alwaysmeticulous/cli simulate \\
  --sessionId="ses_abc123..." \\
  --appUrl="http://localhost:3000" \\
  --devtools

# Headless mode for CI
npx @alwaysmeticulous/cli simulate \\
  --sessionId="ses_abc123..." \\
  --appUrl="http://localhost:3000" \\
  --headless
\`\`\`

---

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Replay completed successfully |
| 1 | Replay failed |

---

## crawl

Crawl your app from a start URL to record sessions and create a test run from them. Opens a local headed browser at the start URL and pauses so you can manually log in before crawling starts — useful for bootstrapping session coverage on apps that require a login.

{% callout type="warning" %}
Recording starts as soon as the browser opens, so the login flow (including any credentials you type) is recorded as part of the first session.
{% /callout %}

### Synopsis

\`\`\`bash
npx @alwaysmeticulous/cli crawl \\
  --apiToken="<token>" \\
  --startUrl="<url>" \\
  [options]
\`\`\`

### Required Flags

#### \`--startUrl\`

**Type**: String
**Description**: The URL to start crawling from

**Example**:
\`\`\`bash
--startUrl="https://app.example.com"
\`\`\`

---

### Optional Flags

#### \`--apiToken\`

**Type**: String
**Description**: The API token of the project to record sessions into
**Note**: When omitted, the command uses your OAuth login (run \`meticulous auth login\` and \`meticulous auth set-project\` to choose the project), falling back to the \`METICULOUS_API_TOKEN\` environment variable or your locally stored token

---

#### \`--crawlingTimeoutSeconds\`

**Type**: Number
**Description**: The maximum time in seconds to spend crawling (time spent logging in doesn't count)
**Default**: 120

---

#### \`--maxNumSessions\`

**Type**: Number
**Description**: The maximum number of sessions to record
**Default**: 200

---

#### \`--skipTestRun\`

**Type**: Boolean
**Description**: Don't create a test run from the recorded sessions
**Default**: false

---

### Complete Example

\`\`\`bash
# Crawl for 2 minutes and create a test run from the recorded sessions
npx @alwaysmeticulous/cli crawl \\
  --apiToken="<token>" \\
  --startUrl="https://app.example.com"

# Longer crawl, sessions only (no test run)
npx @alwaysmeticulous/cli crawl \\
  --apiToken="<token>" \\
  --startUrl="https://app.example.com" \\
  --crawlingTimeoutSeconds=600 \\
  --skipTestRun
\`\`\`

When the browser opens, log in if your app requires it, then press Enter in the terminal to start crawling. Once the crawl finishes the CLI prints the URL of the created test run.

---

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Crawl completed successfully |
| 1 | Crawl failed or no sessions were recorded |

---

## ci start-tunnel

Start a secure tunnel for manual testing and debugging.

### Synopsis

\`\`\`bash
npx @alwaysmeticulous/cli ci start-tunnel \\
  --port=<port> \\
  [options]
\`\`\`

### Required Flags

#### \`--port\` / \`-p\`

**Type**: Number
**Description**: Port your local server is running on

**Example**:
\`\`\`bash
--port=3000
-p 3000
\`\`\`

---

### Optional Flags

#### \`--apiToken\`

**Type**: String
**Description**: Your Meticulous API token
**Note**: Required for authentication

---

#### \`--localHost\` / \`-l\`

**Type**: String
**Description**: Host to tunnel to
**Default**: localhost

**Example**:
\`\`\`bash
--localHost=127.0.0.1
\`\`\`

---

#### \`--localHttps\`

**Type**: Boolean
**Description**: Connect to local HTTPS server
**Default**: false

**Example**:
\`\`\`bash
--localHttps
\`\`\`

---

#### \`--localCert\`

**Type**: String (path)
**Description**: Path to SSL certificate file

**Example**:
\`\`\`bash
--localCert="./certs/server.crt"
\`\`\`

---

#### \`--localKey\`

**Type**: String (path)
**Description**: Path to SSL key file

**Example**:
\`\`\`bash
--localKey="./certs/server.key"
\`\`\`

---

#### \`--localCa\`

**Type**: String (path)
**Description**: Path to CA file for self-signed certificates

**Example**:
\`\`\`bash
--localCa="./certs/ca.crt"
\`\`\`

---

#### \`--allowInvalidCert\`

**Type**: Boolean
**Description**: Ignore SSL certificate errors
**Default**: false

**Example**:
\`\`\`bash
--allowInvalidCert
\`\`\`

---

#### \`--proxyAllUrls\`

**Type**: Boolean
**Description**: Proxy all URLs through tunnel
**Default**: false

---

#### \`--rewriteHostnameToAppUrl\`

**Type**: Boolean
**Description**: Rewrite request hostnames
**Default**: false

---

#### \`--enableDnsCache\`

**Type**: Boolean
**Description**: Enable DNS caching
**Default**: false

---

#### \`--printRequests\`

**Type**: Boolean
**Description**: Log all requests through tunnel
**Default**: false

**Example**:
\`\`\`bash
--printRequests
\`\`\`

---

#### \`--http2Connections\`

**Type**: Number
**Description**: Number of HTTP/2 connections for multiplexing
**Default**: Number of CPU cores

**Example**:
\`\`\`bash
--http2Connections=8
\`\`\`

---

### Complete Example

\`\`\`bash
# Basic tunnel
npx @alwaysmeticulous/cli ci start-tunnel \\
  --port=3000

# With request logging
npx @alwaysmeticulous/cli ci start-tunnel \\
  --port=3000 \\
  --printRequests

# HTTPS tunnel with self-signed cert
npx @alwaysmeticulous/cli ci start-tunnel \\
  --port=3000 \\
  --localHttps \\
  --allowInvalidCert

# Multi-server setup
npx @alwaysmeticulous/cli ci start-tunnel \\
  --port=3000 \\
  --proxyAllUrls
\`\`\`

---

### Output

When tunnel starts successfully:

\`\`\`
Your url is: https://abc123.meticulous.ai
user: meticulous, password: ******
\`\`\`

Use these credentials to access your app through the tunnel.

---

## ci prepare

Ensure a base test run exists before running tests.

### Synopsis

\`\`\`bash
npx @alwaysmeticulous/cli ci prepare \\
  --apiToken="<token>" \\
  [options]
\`\`\`

### Required Flags

#### \`--apiToken\`

**Type**: String
**Description**: Your Meticulous API token

---

### Required Flags

#### \`--triggerScript\`

**Type**: String
**Description**: Path to script that triggers a test run on a specific commit

---

### Optional Flags

#### \`--headCommit\`

**Type**: String
**Description**: Commit SHA to check/prepare
**Default**: Auto-detected

---

### Complete Example

\`\`\`bash
npx @alwaysmeticulous/cli ci prepare \\
  --apiToken="$METICULOUS_API_TOKEN" \\
  --triggerScript="./scripts/trigger-test-run.sh"
\`\`\`

---

## ci label-commit

Attach labels to a commit. Labelling a commit as \`not-relevant\` tells Meticulous the commit doesn't affect the app under test, so it can be skipped when searching for a base test run to compare against.

### Synopsis

\`\`\`bash
npx @alwaysmeticulous/cli ci label-commit \\
  --apiToken="<token>" \\
  --labels not-relevant \\
  [options]
\`\`\`

### Required Flags

#### \`--apiToken\`

**Type**: String
**Description**: Your Meticulous API token

---

#### \`--labels\`

**Type**: String (list)
**Description**: The labels to attach to the commit. Supported labels: \`not-relevant\`

---

### Optional Flags

#### \`--commitSha\`

**Type**: String
**Description**: The commit to label
**Default**: Auto-detected from git

---

### Complete Example

\`\`\`bash
npx @alwaysmeticulous/cli ci label-commit \\
  --apiToken="$METICULOUS_API_TOKEN" \\
  --labels not-relevant
\`\`\`

---

## Common Patterns

### Environment Variables

Set API token via environment variable:

\`\`\`bash
export METICULOUS_API_TOKEN="met_live_abc123..."

# Now can omit --apiToken flag
npx @alwaysmeticulous/cli ci run-with-tunnel \\
  --appUrl="http://localhost:3000"
\`\`\`

---

### CI Integration

#### GitHub Actions

\`\`\`yaml
- name: Run Meticulous tests
  run: |
    npx @alwaysmeticulous/cli ci run-with-tunnel \\
      --apiToken="\${{ secrets.METICULOUS_API_TOKEN }}" \\
      --appUrl="http://localhost:3000"
\`\`\`

#### GitLab CI

\`\`\`yaml
script:
  - >
    npx @alwaysmeticulous/cli ci upload-assets
    --apiToken="$METICULOUS_API_TOKEN"
    --appDirectory="dist"
    --commitSha="$CI_COMMIT_SHA"
\`\`\`

---

### Debug Mode

Enable verbose logging:

\`\`\`bash
DEBUG=meticulous:* npx @alwaysmeticulous/cli ci run-with-tunnel \\
  --apiToken="$METICULOUS_API_TOKEN" \\
  --appUrl="http://localhost:3000"
\`\`\`

---

### Scripting

Use in shell scripts:

\`\`\`bash
#!/bin/bash
set -e

# Start app
npm start &
APP_PID=$!

# Wait for app
npx wait-on http://localhost:3000

# Run tests
npx @alwaysmeticulous/cli ci run-with-tunnel \\
  --apiToken="$METICULOUS_API_TOKEN" \\
  --appUrl="http://localhost:3000"

# Cleanup
kill $APP_PID
\`\`\`

---

## Troubleshooting

### "API token required"

**Cause**: No API token provided

**Solution**: Pass \`--apiToken\` or set \`METICULOUS_API_TOKEN\` env var

---

### "Failed to connect"

**Cause**: App not running or wrong URL

**Solutions**:
1. Verify app is running: \`curl http://localhost:3000\`
2. Check port in \`--appUrl\` matches actual port
3. Increase wait time before running command

---

### "No sessions found"

**Cause**: No recorded sessions for project

**Solution**: Record sessions first (add recorder snippet to app)

---

### "Tunnel connection failed"

**Cause**: Network/firewall issue

**Solutions**:
1. Check outbound HTTPS (443) is allowed
2. Try \`--printRequests\` to debug
3. Contact support if persists

---

## See Also

- [GitHub Actions Setup](${GITHUB_ACTIONS_SETUP_URL}) - GitHub Actions configuration
- [Tunnel Advanced Options](${TUNNEL_ADVANCED_OPTIONS_URL}) - Detailed tunnel configuration
- [FAQ & Troubleshooting](${FAQ_AND_TROUBLESHOOTING_URL}) - Common issues and solutions
`;
