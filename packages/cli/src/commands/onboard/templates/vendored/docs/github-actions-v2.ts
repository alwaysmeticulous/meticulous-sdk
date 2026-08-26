import { METICULOUS_SUPPORT_EMAIL } from "src/lib/next/next.constants";
import {
  BRANCHES_REQUIRED_TO_RUN_ON_URL,
  ENABLE_SOURCE_COVERAGE_URL,
  MAKE_CHECK_BLOCKING_URL,
  ONBOARDING_GUIDE_URL,
} from "src/lib/utils/internal-urls/docs-urls.utils";
import {
  GITHUB_ACTION_UPLOAD_ASSETS_NAME,
  GITHUB_ACTION_UPLOAD_CONTAINER_NAME,
  METICULOUS_GITHUB_APP_INSTALL_URL,
} from "./constants";
import { linkBitbucketInstructions } from "./how-to/link-bitbucket";
import { linkGitLabInstructions } from "./how-to/link-gitlab";

const STATIC_ASSET_URLS_WARNING = `
{% callout_card variant="warning" title="Important: Static Asset URLs" %}
Meticulous automatically swaps the base URL (origin) for navigation and API requests, but **static assets (CSS, JS, images) referenced with absolute URLs in your HTML are NOT automatically rewritten**.

If your HTML contains absolute URLs like:
\`\`\`html
<script src="https://example.com/dist/app.js"></script>
<link href="https://example.com/styles/main.css" rel="stylesheet">
\`\`\`

You should change them to relative URLs:
\`\`\`html
<script src="/dist/app.js"></script>
<link href="/styles/main.css" rel="stylesheet">
\`\`\`

This ensures assets are loaded from the correct test environment rather than the original recording environment.
{% /callout_card %}
`;

const workflowTrigger = `
# Important: The workflow needs to run both on pushes to your main branch and on
# pull requests. It needs to run on your main branch because it'll use the results
# from the base commit of the PR on the main branch to compare against.
on:
  push:
    branches:
      - main
  pull_request: {}
  # Important: We need the workflow to be triggered on workflow_dispatch events,
  # so that Meticulous can run the workflow on the base commit to compare
  # against if an existing workflow hasn't run. The meticulous-commit-sha input
  # lets Meticulous ask for a specific commit (e.g. stacked PRs); without it,
  # a dispatched run can only build whatever the branch currently points at.
  workflow_dispatch:
    inputs:
      meticulous-commit-sha:
        description: Commit Meticulous has asked this run to build. Defaults to the branch head.
        required: false`;

const workflowShared = `
name: Meticulous
${workflowTrigger}

# Important: The workflow needs all the permissions below.
# These permissions are mainly needed to post and update the status check and
# feedback comment on your PR. Meticulous won't work without them.
permissions:
  actions: write
  contents: read
  issues: write
  pull-requests: write
  statuses: read

env:
  # Prefer the dispatched commit when set; otherwise the PR head. On pull_request github.sha is the merge commit,
  # not the PR head SHA that Meticulous looks up.
  METICULOUS_COMMIT_SHA: \${{ github.event.inputs['meticulous-commit-sha'] || (github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha) }}

jobs:
  test:
    name: Meticulous
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          ref: \${{ env.METICULOUS_COMMIT_SHA }}

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10
          run_install: false

      - name: Use Node.js LTS
        uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: pnpm

      - name: Cache node_modules
        uses: actions/cache@v4
        with:
          path: node_modules
          key: node-modules-\${{ runner.os }}-\${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            node-modules-\${{ runner.os }}

      - name: Install dependencies
        run: |
          pnpm install --frozen-lockfile

      - name: Build project
        # METICULOUS_BUILD marks this as a build for Meticulous testing.
        env:
          METICULOUS_BUILD: "true"
        run: |
          pnpm build
`;

export const document = `---
{
  "title": "Setting up Meticulous tests to run in your CI provider"
}
---

# {% $frontmatter.title %}

In this guide, we'll show you how to set up Meticulous to run in your CI system.

{% tabs tabNameSpace="provider" %}
{% tab label="GitHub" %}

## 1. Install the Meticulous GitHub App

If you haven't already connected this repository in [Connect your repository](${ONBOARDING_GUIDE_URL}#1-connect-your-repository), visit [${METICULOUS_GITHUB_APP_INSTALL_URL}](${METICULOUS_GITHUB_APP_INSTALL_URL}) to install our GitHub App.

## 2. Add your Meticulous API token as a secret to your GitHub repository

Select the project below that contains the sessions you wish to simulate, copy
and paste the API token, and add it to your GitHub repository as a secret named
\`METICULOUS_API_TOKEN\`:

{% code_with_project_selector %}
METICULOUS_API_TOKEN:
{% standalone_api_token /%}
{% /code_with_project_selector %}

*Be very careful with this API token, since it allows the holder access to your recorded sessions.*

{% expand title="How do I add it as a secret to my GitHub repository?" %}
Open your repo and go to the settings tab:

![Settings tab](https://assets.meticulous.ai/docs/repo-settings-tab.png)

Select the actions tab within the secrets tab:

![Secrets tab](https://assets.meticulous.ai/docs/actions-secrets-tab.png)

And click the new repository secret button:

![New repository secret button](https://assets.meticulous.ai/docs/new-repo-secret-button.png)

Name the secret \`METICULOUS_API_TOKEN\`, and paste in the API token you copied from the previous step, and click add secret:

![Add secret](https://assets.meticulous.ai/docs/new-secret-screen.png)
{% /expand %}

## 3. Add a GitHub Actions workflow to run your tests

To run Meticulous on CI add a new \`.github/workflows/meticulous.yaml\` file, or, if you already use GitHub Actions, you
can add it as a job to an existing workflow. The workflow needs to run on both [pushes to your main branch and on pull requests](${BRANCHES_REQUIRED_TO_RUN_ON_URL}).

We offer two approaches to running Meticulous tests on CI. We recommend choosing the first approach that works for your app:

1. **Upload your built assets** for us to test. This is the recommended approach if your app is a static site, i.e. it can be served as a folder of static assets (HTML/JS/CSS) without any server-side rendering or complex request rewriting. This approach is **NOT recommended** for Next.js applications as they typically cannot be served as static assets.
2. **Upload a built container image** (e.g. a Docker image) for us to test. This is the recommended approach for most other apps, including Next.js applications. Almost any app can be containerized, so this is the universal fallback.

{% tabs tabNameSpace="type" %}
{% tab label="Upload static assets" %}

This workflow file should use our \`upload-assets\` action to upload your built assets for us to test.

See below for an example workflow file, which you can add to your repo. Note that you'll need to update it with the build steps for your app.

File name: \`.github/workflows/meticulous.yaml\`.

File contents:

\`\`\`yaml
# Workflow for building frontend and running Meticulous tests against static assets
${workflowShared}
      - name: Run Meticulous tests
        uses: ${GITHUB_ACTION_UPLOAD_ASSETS_NAME}@v1
        with:
          api-token: \${{ secrets.METICULOUS_API_TOKEN }}
          # TODO: Update the directory path below to match your app's build output directory
          # For example, if you're using Vite, this is typically "dist"
          app-directory: "dist"
\`\`\`

${STATIC_ASSET_URLS_WARNING}
{% /tab %}
{% tab label="Upload container image" %}

This workflow file should use our \`upload-container\` action to upload your built container image for us to test.

Some requirements for the docker image you build are:
- It should be built for the \`linux/amd64\` platform
- It should respect the \`PORT\` environment variable, or if it doesn't, you should specify the port using the \`container-port\` input to the \`upload-container\` action.
- It should respond to the \`GET /\` endpoint for a health check probe.

You can provide additional environment variables, if needed, to the container using the \`container-env\` input to the \`upload-container\` action,
specifying them as a newline-delimited list of \`NAME=value\` pairs.

See below for an example workflow file, which you can add to your repo. Note that you'll need to update it with the build steps for your app.

File name: \`.github/workflows/meticulous.yaml\`.

File contents:

\`\`\`yaml
# Workflow for building frontend and running Meticulous tests against a container image
${workflowShared}
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Docker Build (no push)
        uses: docker/build-push-action@v6
        with:
          context: .
          tags: my-app:\${{ env.METICULOUS_COMMIT_SHA }}
          push: false
          # Marks the image as a Meticulous build. Consume it in your
          # Dockerfile with \`ARG METICULOUS_BUILD\` / \`ENV METICULOUS_BUILD=$METICULOUS_BUILD\`
          # if you need it at build time (e.g. getStaticProps / static generation).
          build-args: |
            METICULOUS_BUILD=true

      - name: Run Meticulous tests
        uses: ${GITHUB_ACTION_UPLOAD_CONTAINER_NAME}@v1
        with:
          api-token: \${{ secrets.METICULOUS_API_TOKEN }}
          image-tag: my-app:\${{ env.METICULOUS_COMMIT_SHA }}
          # Optional inputs:
          container-port: 1234
          # METICULOUS_BUILD is also passed at runtime so server-side code (e.g.
          # getServerSideProps) can detect the Meticulous replay.
          container-env: |
            MY_ENV_VAR=my-value
            METICULOUS_BUILD=true
\`\`\`

${STATIC_ASSET_URLS_WARNING}
{% /tab %}
{% /tabs %}

If you hit any issues then email [${METICULOUS_SUPPORT_EMAIL}](mailto:${METICULOUS_SUPPORT_EMAIL}) and we'll help you get set up.

{% expand title="Naming workflows, jobs and secrets in a monorepo (recommended)" %}

If your repository only ever ships one frontend, the generic names from the example
above (\`.github/workflows/meticulous.yaml\`, workflow \`name: Meticulous\`,
\`METICULOUS_API_TOKEN\` secret) are fine and you can skip this section.

If your repository is a monorepo with more than one frontend, **or might host another
Meticulous-tested frontend later**, per-app naming from the start makes future expansion
painless: a second project can be added side-by-side without renaming the existing
workflow file, job, or repository secret. The convention costs nothing on day one and
keeps later additions contained to a new file.

Two pieces of identity drive everything:

- **\`<app-kebab>\`** — lowercase hyphenated, usually the last path segment of the
  app you're onboarding (e.g. an app at \`apps/dashboard\` becomes \`dashboard\`). Used
  in the workflow filename, the workflow \`name:\`, and the job \`name:\`.
- **\`<APP_SLUG>\`** — the same identity as \`SCREAMING_SNAKE_CASE\` (e.g. \`dashboard\`
  becomes \`DASHBOARD\`, \`marketing-site\` becomes \`MARKETING_SITE\`). Used in the GitHub
  repository secret name and every \`secrets.*\` expression that reads it. A second
  Meticulous project on the same monorepo later picks a different \`<APP_SLUG>\`, so
  the two never collide.

The convention we recommend:

| | Recommended | Avoid |
| --- | --- | --- |
| New workflow file | \`.github/workflows/meticulous-<app-kebab>.yml\` | \`.github/workflows/meticulous.yaml\` |
| Workflow YAML top-level \`name:\` | \`Meticulous (<app-kebab>)\` | bare \`Meticulous\` |
| Job \`name:\` (\`jobs.<id>.name\`) | \`Meticulous (<app-kebab>)\` | bare \`Meticulous\` |
| GitHub repository secret | \`METICULOUS_API_TOKEN_<APP_SLUG>\` | bare \`METICULOUS_API_TOKEN\` |
| YAML reference to the API token | \`\${{ secrets.METICULOUS_API_TOKEN_<APP_SLUG> }}\` | \`\${{ secrets.METICULOUS_API_TOKEN }}\` |

We also recommend scoping the workflow to the selected app's directory (and the
shared UI libraries it imports) using \`paths:\` filters on both \`push\` and
\`pull_request\` triggers, so the workflow only runs on commits that actually touch
the relevant code.

Pulling those together for an app at \`apps/dashboard\` (so \`<app-kebab>\` is
\`dashboard\` and \`<APP_SLUG>\` is \`DASHBOARD\`):

\`\`\`yaml
# .github/workflows/meticulous-dashboard.yml
name: Meticulous (dashboard)

on:
  push:
    branches: [main]
    paths:
      - "apps/dashboard/**"
      # any UI libraries the app imports:
      - "packages/ui/**"
  pull_request:
    paths:
      - "apps/dashboard/**"
      - "packages/ui/**"
  workflow_dispatch:
    inputs:
      meticulous-commit-sha:
        description: Commit Meticulous has asked this run to build. Defaults to the branch head.
        required: false

permissions:
  actions: write
  contents: read
  issues: write
  pull-requests: write
  statuses: read

env:
  # Prefer the dispatched commit when set; otherwise the PR head. On pull_request github.sha is the merge commit,
  # not the PR head SHA that Meticulous looks up.
  METICULOUS_COMMIT_SHA: \${{ github.event.inputs['meticulous-commit-sha'] || (github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha) }}

jobs:
  test:
    name: Meticulous (dashboard)
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ env.METICULOUS_COMMIT_SHA }}
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter dashboard build
        env:
          METICULOUS_BUILD: "true"
      - uses: ${GITHUB_ACTION_UPLOAD_ASSETS_NAME}@v1
        with:
          api-token: \${{ secrets.METICULOUS_API_TOKEN_DASHBOARD }}
          app-directory: "apps/dashboard/dist"
\`\`\`

When a second app on the same monorepo is later onboarded to Meticulous, copy this
file to \`meticulous-<other-app-kebab>.yml\` and substitute the second app's
\`<app-kebab>\` and \`<APP_SLUG>\` — the existing workflow stays untouched.

If a CLI step in the workflow reads \`$METICULOUS_API_TOKEN\` directly (for example a
script that calls \`npx @alwaysmeticulous/cli\` outside the action), re-expose the
suffixed secret under the bare environment-variable name on that job or step:

\`\`\`yaml
jobs:
  test:
    # ...
    env:
      METICULOUS_API_TOKEN: \${{ secrets.METICULOUS_API_TOKEN_<APP_SLUG> }}
\`\`\`

The GitHub repository secret name and every \`\${{ secrets.* }}\` expression still use
the suffixed form; only the in-job environment variable is re-exposed under the
generic name.

{% /expand %}

{% expand title="Choosing the runner size (optional)" %}

The example workflow uses \`runs-on: ubuntu-latest\` — GitHub's free runner. Meticulous's
build + replay step can be resource-heavy, so a larger runner can roughly halve the
wall-clock time of the job at extra cost. GitHub provides progressively larger labels
such as \`ubuntu-latest-4-cores\`, \`ubuntu-latest-8-cores\`, and \`ubuntu-latest-16-cores\`
(the exact labels available depend on your account's plan and any
[larger runners](https://docs.github.com/en/actions/using-github-hosted-runners/about-larger-runners)
you have configured).

If you already build the app on a larger runner in another workflow, the simplest
choice is to use the same \`runs-on\` label here so the Meticulous job has at least as
much capacity as your normal build. Otherwise \`ubuntu-latest\` is a safe starting
point — you can scale up later if the job runs slowly.

{% /expand %}

{% expand title="Enable source maps (recommended)" %}

Meticulous uses source maps to attribute coverage to the original files in your repository
so you can see which parts of your code are exercised by the tested sessions. The cleanest
way to enable them is **inside this Meticulous workflow only**, via a CLI flag or
environment variable on the build command — your committed build config stays untouched,
and your other workflows (PR builds, production deploys) keep their existing behaviour.

Pick the snippet for your framework and apply it to the \`Build project\` step of the
example workflow above:

**Vite** — pass \`--sourcemap\` to \`vite build\`:

\`\`\`yaml
      - name: Build project
        run: pnpm build -- --sourcemap
\`\`\`

**Create React App** — set \`GENERATE_SOURCEMAP=true\`:

\`\`\`yaml
      - name: Build project
        env:
          GENERATE_SOURCEMAP: "true"
        run: pnpm build
\`\`\`

**Angular CLI** — pass \`--source-map\` to \`ng build\`:

\`\`\`yaml
      - name: Build project
        run: pnpm exec ng build --source-map
\`\`\`

**webpack (custom config)** — set \`SOURCEMAP=true\` in CI and read it from
\`webpack.config.js\`:

\`\`\`yaml
      - name: Build project
        env:
          SOURCEMAP: "true"
        run: pnpm build
\`\`\`

\`\`\`js
// webpack.config.js
module.exports = (env, argv) => ({
  // ...
  devtool: process.env.SOURCEMAP === "true" ? "source-map" : argv.devtool,
});
\`\`\`

**Next.js** and **Vue CLI** don't accept a build-time flag for this; they require a
one-line config change:

- Next.js — add \`productionBrowserSourceMaps: true\` to \`next.config.js\` (covers App
  Router and Pages Router).
- Vue CLI — add \`productionSourceMap: true\` to \`vue.config.js\`.

These settings are safe to leave on permanently; they don't change runtime behaviour.

Source maps must be served alongside the built assets — either as \`.map\` files in the
same directory, via \`sourceMappingURL\` comments in the bundles, or via the \`SourceMap\`
HTTP header. The \`upload-assets\` and \`upload-container\` actions pick them up
automatically when they sit next to the bundles in your build output.

For monorepo source maps that span multiple packages, see the
[Viewing source coverage information in Meticulous guide](${ENABLE_SOURCE_COVERAGE_URL}).

{% callout_card variant="warning" title="Cloud Replay only" %}
If you use cloud replay against a public preview URL (Vercel, Netlify, etc.), enabling
source maps will expose them on that public URL. If you would like coverage in this case,
email [${METICULOUS_SUPPORT_EMAIL}](mailto:${METICULOUS_SUPPORT_EMAIL}) — we can help you scope
source-map publishing to the default branch or switch to \`upload-assets\` /
\`upload-container\` where they stay internal.
{% /callout_card %}

{% /expand %}

### GitHub Action Configuration Reference

All available inputs are documented in the action definition files:
- [\`upload-assets\`](https://github.com/alwaysmeticulous/report-diffs-action/blob/main/upload-assets/action.yaml) - Upload static assets for testing (recommended for static sites)
- [\`upload-container\`](https://github.com/alwaysmeticulous/report-diffs-action/blob/main/upload-container/action.yml) - Upload a container image for testing
- [\`report-diffs-action\`](https://github.com/alwaysmeticulous/report-diffs-action/blob/main/action.yml) - Run tests in GitHub Actions runner (legacy)

## 4. Validate that your workflow is working correctly

Create a new pull request to add the above workflow. Then validate that Meticulous is able to access your application
correctly and is successfully simulating sessions by viewing the test run for your PR in the Meticulous UI.

{% callout_card variant="info" title="PR comments are off by default" %}
Comments on PRs are disabled by default for new projects (this is an admin-only setting). You'll be able to see all test runs in the Meticulous UI under your project's "Test runs" tab. If you'd like to enable PR comments for your project, contact us at [${METICULOUS_SUPPORT_EMAIL}](mailto:${METICULOUS_SUPPORT_EMAIL}).
{% /callout_card %}

## 5. Merge the PR to add your new GitHub workflow, and open a new PR to test Meticulous

Merge the PR to add the above workflow. You won&apos;t see any results on the PR that adds the workflow because you need to wait for the workflow to run on your main branch for it to detect any diffs.

Once the PR has merged and Meticulous has run on your base branch you can open a new PR to test Meticulous. The test run will be visible in the Meticulous UI under your project's "Test runs" tab, where you can review any visual diffs before merging your PR.

If PR comments are enabled for your project, Meticulous will also post a comment on the PR if it changed any of the screens or logic for the workflows you've recorded sessions for:

![Meticulous comment](https://assets.meticulous.ai/docs/github-actions-v2-006.png)

## 6. (Optional) Require approving diffs before merging a PR

If you've installed the [Meticulous GitHub App](https://github.com/apps/alwaysmeticulous) Meticulous will add a check on your PR that is red
if there are diffs that haven't been approved yet and becomes green once you click the green 'Approve all Visual Differences' button.
This button can be found on the test run page in the Meticulous UI (or by clicking the link in the Meticulous PR comment, if comments are enabled).

If you wish, you can make this check blocking by following the instructions [here](${MAKE_CHECK_BLOCKING_URL}). Doing so will prevent developers
from merging a PR which has visual differences until they have clicked the button to acknowledge the differences.

{% /tab %}
{% tab label="GitLab" %}

If you are able to build your app such that it can be served as a folder of static assets (HTML/JS/CSS) without any server-side rendering or complex request rewriting,
then you can use our \`ci upload-assets\` CLI command to upload your built assets for us to test.

## 1. Link GitLab to Meticulous

If you haven't already connected this repository in [Connect your repository](${ONBOARDING_GUIDE_URL}#1-connect-your-repository), complete the steps below.

${linkGitLabInstructions}

## 2. Add your Meticulous API token as a CI/CD variable

Select the project below that contains the sessions you wish to simulate, copy and paste the API token, and add it to your GitLab project
as a CI/CD variable named \`METICULOUS_API_TOKEN\`:

{% code_with_project_selector %}
METICULOUS_API_TOKEN:
{% standalone_api_token /%}
{% /code_with_project_selector %}

*Be very careful with this API token, since it allows the holder access to your recorded sessions.*

## 3. Add a GitLab CI/CD pipeline to run your tests

To run Meticulous on CI, add a new \`.gitlab-ci.yml\` file to your repository. The pipeline needs to run on both pushes to your main branch and on merge requests.

This pipeline should use our \`ci upload-assets\` CLI command to upload your built assets for us to test.

File name: \`.gitlab-ci.yml\`

File contents:

\`\`\`yaml
stages:
  - build
  - test

variables:
  NODE_VERSION: "24"

build:
  stage: build
  image: node:24-alpine
  # METICULOUS_BUILD marks this as a build for Meticulous testing.
  variables:
    METICULOUS_BUILD: "true"
  script:
    - pnpm install --frozen-lockfile
    - pnpm build
  artifacts:
    paths:
      - dist/
    expire_in: 1 hour
  only:
    - main
    - merge_requests

test:
  stage: test
  image: node:24-alpine
  dependencies:
    - build
  script:
    - >
      npx @alwaysmeticulous/cli ci upload-assets
      --apiToken="$METICULOUS_API_TOKEN"
      --appDirectory="dist"
      --commitSha="$CI_COMMIT_SHA"
      --waitForBase
  only:
    - main
    - merge_requests
\`\`\`

**Important:** Make sure to update the \`appDirectory\` path to match your app's build output directory. For example, if you're using Vite, this is typically "dist".

{% expand title="Naming jobs and variables in a monorepo (recommended)" %}

If your repository only ever ships one frontend, the generic names from the example
above (\`meticulous:\` job, \`METICULOUS_API_TOKEN\` variable) are fine and you can skip
this section.

If your repository is a monorepo with more than one frontend, **or might host another
Meticulous-tested frontend later**, per-app naming from the start makes future expansion
painless: a second project can be added side-by-side without renaming the existing job
or CI/CD variable. The convention costs nothing on day one and keeps later additions
contained to a new job (or a new included pipeline file).

Two pieces of identity drive everything:

- **\`<app-kebab>\`** — lowercase hyphenated, usually the last path segment of the
  app you're onboarding (e.g. an app at \`apps/dashboard\` becomes \`dashboard\`). Used
  in the job key and the optional included file name.
- **\`<APP_SLUG>\`** — the same identity as \`SCREAMING_SNAKE_CASE\` (e.g. \`dashboard\`
  becomes \`DASHBOARD\`, \`marketing-site\` becomes \`MARKETING_SITE\`). Used in the GitLab
  CI/CD variable name and every YAML reference to it. A second Meticulous project on
  the same monorepo later picks a different \`<APP_SLUG>\`, so the two never collide.

The convention we recommend:

| | Recommended | Avoid |
| --- | --- | --- |
| Job key in \`.gitlab-ci.yml\` (or included pipeline file) | \`meticulous-<app-kebab>:\` | bare \`meticulous:\` |
| GitLab CI/CD variable | \`METICULOUS_API_TOKEN_<APP_SLUG>\` | bare \`METICULOUS_API_TOKEN\` |
| YAML reference to the API token | \`$METICULOUS_API_TOKEN_<APP_SLUG>\` | bare \`$METICULOUS_API_TOKEN\` |
| Optional included pipeline file | \`.gitlab/ci/meticulous-<app-kebab>.yml\` (then \`include:\` it from \`.gitlab-ci.yml\`) | a second bare \`meticulous\` block in \`.gitlab-ci.yml\` |

We also recommend scoping the job to the selected app's path (and the shared UI
libraries it imports) using \`rules: changes:\`, so the Meticulous job only runs on
commits that actually touch the relevant code. If your existing pipeline uses
\`only:\` instead of \`rules:\`, mirror that style with \`only: changes:\`.

Pulling those together for an app at \`apps/dashboard\` (so \`<app-kebab>\` is
\`dashboard\` and \`<APP_SLUG>\` is \`DASHBOARD\`):

\`\`\`yaml
meticulous-dashboard:
  stage: test
  image: node:24-alpine
  variables:
    METICULOUS_BUILD: "true"
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      changes:
        - "apps/dashboard/**/*"
        # any UI libraries the app imports:
        - "packages/ui/**/*"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      changes:
        - "apps/dashboard/**/*"
        - "packages/ui/**/*"
  script:
    - pnpm install --frozen-lockfile
    - pnpm --filter dashboard build
    - >
      npx @alwaysmeticulous/cli ci upload-assets
      --apiToken="$METICULOUS_API_TOKEN_DASHBOARD"
      --appDirectory="apps/dashboard/dist"
      --commitSha="$CI_COMMIT_SHA"
      --waitForBase
\`\`\`

When a second app on the same monorepo is later onboarded to Meticulous, copy this
block and substitute the second app's \`<app-kebab>\` and \`<APP_SLUG>\` — the existing
job stays untouched.

If you'd rather expose the suffixed variable under the bare \`METICULOUS_API_TOKEN\`
name inside the job (for example because the build script reads
\`process.env.METICULOUS_API_TOKEN\` directly), add a job-scoped \`variables:\` mapping:

\`\`\`yaml
meticulous-<app-kebab>:
  # ...
  variables:
    METICULOUS_API_TOKEN: $METICULOUS_API_TOKEN_<APP_SLUG>
\`\`\`

The CI/CD variable name and every direct YAML reference still use the suffixed form;
only the in-job environment variable is re-exposed under the generic name.

{% /expand %}

{% expand title="Choosing the image and tags (optional)" %}

\`image:\` controls the Docker image used for the job (Node version, OS). The example
above uses \`node:24-alpine\`; if your existing pipeline uses a different Node version,
or a non-Alpine image (e.g. \`node:24\` for native build tooling that needs glibc),
use the same image for the Meticulous job. If your pipeline references a project-level
\`NODE_VERSION\` variable (e.g. \`image: node:\${NODE_VERSION}-alpine\`), reuse that variable
rather than hard-coding the version.

\`tags:\` controls which registered runner picks up the job, and you usually do not need
to set it. Most projects rely on a default runner configured at the project or group
level, and adding tags can route the job to a runner that doesn't exist. If your
existing pipeline already sets \`tags:\` on build-heavy jobs (literal strings — not
\`$VAR\` or \`!reference\` indirection), copy the same list onto the Meticulous job.

If you're on GitLab.com SaaS shared runners and the default \`saas-linux-small-amd64\`
turns out to be too slow for Meticulous's build + replay, you can opt into a larger
runner by adding \`tags: [saas-linux-large-amd64]\` (or similar). This is optional and
only applies to GitLab.com SaaS — self-managed instances configure runner sizes
differently.

{% /expand %}

{% expand title="Enable source maps (recommended)" %}

Meticulous uses source maps to attribute coverage to the original files in your repository
so you can see which parts of your code are exercised by the tested sessions. The cleanest
way to enable them is **inside this Meticulous pipeline only**, via a CLI flag or
environment variable on the build command — your committed build config stays untouched,
and your other pipelines (MR builds, production deploys) keep their existing behaviour.

Pick the snippet for your framework and apply it to the \`build\` job of the example
pipeline above:

**Vite** — pass \`--sourcemap\` to \`vite build\`:

\`\`\`yaml
build:
  script:
    - pnpm install --frozen-lockfile
    - pnpm build -- --sourcemap
\`\`\`

**Create React App** — set \`GENERATE_SOURCEMAP=true\`:

\`\`\`yaml
build:
  variables:
    GENERATE_SOURCEMAP: "true"
  script:
    - pnpm install --frozen-lockfile
    - pnpm build
\`\`\`

**Angular CLI** — pass \`--source-map\` to \`ng build\`:

\`\`\`yaml
build:
  script:
    - pnpm install --frozen-lockfile
    - pnpm exec ng build --source-map
\`\`\`

**webpack (custom config)** — set \`SOURCEMAP=true\` in CI and read it from
\`webpack.config.js\`:

\`\`\`yaml
build:
  variables:
    SOURCEMAP: "true"
  script:
    - pnpm install --frozen-lockfile
    - pnpm build
\`\`\`

\`\`\`js
// webpack.config.js
module.exports = (env, argv) => ({
  // ...
  devtool: process.env.SOURCEMAP === "true" ? "source-map" : argv.devtool,
});
\`\`\`

**Next.js** and **Vue CLI** don't accept a build-time flag for this; they require a
one-line config change:

- Next.js — add \`productionBrowserSourceMaps: true\` to \`next.config.js\` (covers App
  Router and Pages Router).
- Vue CLI — add \`productionSourceMap: true\` to \`vue.config.js\`.

These settings are safe to leave on permanently; they don't change runtime behaviour.

Source maps must be served alongside the built assets — either as \`.map\` files in the
same directory, via \`sourceMappingURL\` comments in the bundles, or via the \`SourceMap\`
HTTP header. The \`ci upload-assets\` and \`ci upload-container\` commands pick them up
automatically when they sit next to the bundles in your build output.

For monorepo source maps that span multiple packages, see the
[Viewing source coverage information in Meticulous guide](${ENABLE_SOURCE_COVERAGE_URL}).

{% /expand %}

## 4. Merge the MR to add your new GitLab CI/CD pipeline, and open a new MR to test Meticulous

Merge the MR to add the above pipeline configuration. You won't see any results on the MR that adds the pipeline because you need to wait for the pipeline to run on your main branch for it to detect any diffs.

Once the MR has merged and Meticulous has run on your base branch you can open a new MR to test Meticulous.
Comments are typically disabled when you first create a project in Meticulous, but you'll be able to see the test results within the Meticulous UI.

{% /tab %}
{% tab label="BitBucket" %}

If you are able to build your app such that it can be served as a folder of static assets (HTML/JS/CSS) without any server-side rendering or complex request rewriting,
then you can use our \`ci upload-assets\` CLI command to upload your built assets for us to test.

## 1. Link Bitbucket to Meticulous

If you haven't already connected this repository in [Connect your repository](${ONBOARDING_GUIDE_URL}#1-connect-your-repository), complete the steps below.

${linkBitbucketInstructions}

## 2. Add your Meticulous API token as a repository variable

Select the project below that contains the sessions you wish to simulate, copy and paste the API token, and add it to your Bitbucket repository
as a secured repository variable named \`METICULOUS_API_TOKEN\`:

{% code_with_project_selector %}
METICULOUS_API_TOKEN:
{% standalone_api_token /%}
{% /code_with_project_selector %}

*Be very careful with this API token, since it allows the holder access to your recorded sessions.*

## 3. Add a Bitbucket Pipelines configuration to run your tests

To run Meticulous on CI, add a \`bitbucket-pipelines.yml\` file to your repository. The pipeline needs to run on both pushes to your main branch and on pull requests.

This pipeline should use our \`ci upload-assets\` CLI command to upload your built assets for us to test.

On pull request builds, Bitbucket merges the destination branch into the source branch during **Build Setup** before your steps run. Meticulous does **not** support testing that ephemeral merge commit. **Checkout the PR source tip** before building so uploads use a commit Bitbucket exposes via the API and the backend can compare against the **merge-base** with the destination branch.

Add this step at the start of your pull-request pipeline script:

\`\`\`bash
git reset --hard "$BITBUCKET_COMMIT"
\`\`\`

The Meticulous CLI uploads \`git rev-parse HEAD\` (the source tip after the reset above). You do **not** need to pass \`--commitSha\` or \`--baseSha\` manually on PR pipelines.

File name: \`bitbucket-pipelines.yml\`

File contents:

\`\`\`yaml
image: node:24

pipelines:
  branches:
    main:
      - step:
          name: Build and test
          caches:
            - node
          script:
            - npm ci
            # METICULOUS_BUILD marks this as a build for Meticulous testing.
            - METICULOUS_BUILD=true npm run build
            - >
              npx @alwaysmeticulous/cli ci upload-assets
              --apiToken="$METICULOUS_API_TOKEN"
              --appDirectory="dist"
              --waitForBase
  pull-requests:
    "**":
      - step:
          name: Build and test
          caches:
            - node
          script:
            - git reset --hard "$BITBUCKET_COMMIT"
            - npm ci
            # METICULOUS_BUILD marks this as a build for Meticulous testing.
            - METICULOUS_BUILD=true npm run build
            - >
              npx @alwaysmeticulous/cli ci upload-assets
              --apiToken="$METICULOUS_API_TOKEN"
              --appDirectory="dist"
              --waitForBase
\`\`\`

**Important:** Make sure to update the \`appDirectory\` path to match your app's build output directory. For example, if you're using Vite, this is typically "dist".

{% /tab %}
{% /tabs %}
`;
