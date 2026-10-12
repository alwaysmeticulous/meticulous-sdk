import { EXPLANATION_OF_METHODS_TO_ADD_RECORDER } from "./recorder-snippets/explanation-of-methods-to-add-recorder";

export const document = `---
{
  "title": "Get started with Meticulous Recorder"
}
---

# {% $frontmatter.title %}

Meticulous recorder is a tool for recording real user sessions. The recorder captures your users' actions and any network requests
(and responses) during their session. Please note that although plaintext passwords are redacted, the recorded network requests can
include authorization tokens and other headers -- you should therefore only add trusted users to your Meticulous organization.
You can either add the recorder to all environments or just internal non-production environments.

## 1. Create and connect your project

Sign in at [https://app.meticulous.ai](https://app.meticulous.ai) and create a project in your organization. If you're not part
of an organization yet, ask a colleague to invite you, or [book a demo](https://www.meticulous.ai/book-a-demo) to set up an
enterprise license. Connect the project to its GitHub, GitLab, or Bitbucket repository before installing the recorder.

## 2. Install the Meticulous recorder

You can run \`npx @alwaysmeticulous/cli onboard --project="<ORGANIZATION>/<PROJECT>"\` from the connected repository to have
Claude Code or Codex prepare the recorder and CI changes, or install the recorder manually:

${EXPLANATION_OF_METHODS_TO_ADD_RECORDER}
`;
