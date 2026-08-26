import {
  CI_SETUP_URL,
  DETECT_DIFFS_LOCALLY_URL,
  FAQ_AND_TROUBLESHOOTING_URL,
  FIX_FALSE_POSITIVES_URL,
  GITHUB_ACTIONS_SETUP_URL,
  INSTALL_RECORDER_URL,
  MAKE_CHECK_BLOCKING_URL,
  RECORD_AND_REPLAY_ON_DIFFERENT_ENVIRONMENTS_URL,
  TROUBLESHOOT_AUTH_URL,
  TROUBLESHOOT_RECORDER_URL,
} from "src/lib/utils/internal-urls/docs-urls.utils";
import { connectGitProviderInstructions } from "./how-to/connect-git-provider";

export const document = `---
{
  "title": "Meticulous Onboarding Guide"
}
---

# {% $frontmatter.title %}

Set up Meticulous in this order:

1. Connect the repository to Meticulous.
2. Choose automated CLI onboarding or manual setup.
3. Record sessions and confirm Meticulous runs on pull requests.

Connecting the repository first lets Meticulous identify the base and head
versions of each pull request or merge request and publish its test result in
the right place.

---

## 1. Connect your repository

Create your Meticulous organization and project, then connect the Git provider
that hosts the repository. Do this before installing the recorder or configuring
CI.

${connectGitProviderInstructions}

Once the linked project exists, choose how you want to install Meticulous.

---

## 2. Choose your setup path

{% tabs tabNameSpace="setup-path" %}
{% tab label="Meticulous CLI (recommended)" %}

## Automated setup with meticulous onboard

\`meticulous onboard\` uses Claude Code or Codex on your machine to inspect the
application and prepare a pull request containing the recorder and CI
configuration. Meticulous does not host the model inference; the command uses
your existing Claude Code or Codex account.

### Prerequisites

- Run the command from a clone of the connected Git repository.
- Install and authenticate [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or [Codex](https://developers.openai.com/codex/cli/).
- Use Node.js 20 or newer.

### Run onboarding

From the application repository. If you are not logged in, the command opens a
browser to sign in, then continues:

{% command_card %}
\`\`\`bash
npx @alwaysmeticulous/cli onboard --project="{% project_slug /%}"
\`\`\`
{% /command_card %}

On a remote machine where a browser cannot reach this terminal, sign in first
with device login, then re-run onboard:

{% command_card hideProjectSelector=true %}
\`\`\`bash
npx @alwaysmeticulous/cli auth login --device
\`\`\`
{% /command_card %}

It asks you to choose the frontend application in a monorepo and the local
coding agent, reviews the repository, proposes a plan for approval, and then
opens a setup pull request.

After the pull request is ready:

1. Review and merge the recorder and CI changes.
2. Add any requested API token to your CI provider&apos;s secret store.
3. Record a representative session.
4. Open a pull request and confirm that Meticulous reports a result.

{% /tab %}
{% tab label="Manual setup" %}

## Manual recorder and CI setup

Use the guided setup in the Meticulous app or follow these docs:

1. [Install the recorder](${INSTALL_RECORDER_URL}) for localhost and your
   trusted internal or preview environments.
2. Exercise a representative user flow and confirm the session appears in the
   Meticulous project.
3. [Replay the session locally](${DETECT_DIFFS_LOCALLY_URL}) before moving to
   CI. Debugging locally is faster than debugging a CI-only failure.
4. [Choose a CI approach](${CI_SETUP_URL}):
   [upload static assets or a container](${GITHUB_ACTIONS_SETUP_URL}).

For authenticated applications, make sure the recorded flow can sign in and
replay reliably. See [Troubleshooting authentication](${TROUBLESHOOT_AUTH_URL})
and [recording and replaying across environments](${RECORD_AND_REPLAY_ON_DIFFERENT_ENVIRONMENTS_URL}).

{% /tab %}
{% /tabs %}

---

## 3. Verify the complete setup

Setup is complete when:

- The project is linked to the correct GitHub, GitLab, or Bitbucket repository.
- At least one representative session reaches Meticulous.
- A session replays successfully against your application.
- The default branch has a baseline test run.
- A pull request or merge request produces a Meticulous result.

If something fails, start with [recorder troubleshooting](${TROUBLESHOOT_RECORDER_URL})
or the [FAQ and troubleshooting guide](${FAQ_AND_TROUBLESHOOTING_URL}).

After the first successful run, [make the Meticulous check blocking](${MAKE_CHECK_BLOCKING_URL})
and [reduce false-positive diffs](${FIX_FALSE_POSITIVES_URL}).
`;
