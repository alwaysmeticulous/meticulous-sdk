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

Sign up at [https://app.meticulous.ai/signup](https://app.meticulous.ai/signup). You will be prompted to create an organization and
project. Connect the project to its GitHub, GitLab, or Bitbucket repository before installing the recorder.

## 2. Install the Meticulous recorder

You can run \`npx @alwaysmeticulous/cli onboard --project="<ORGANIZATION>/<PROJECT>"\` from the connected repository to have
Claude Code or Codex prepare the recorder and CI changes, or install the recorder manually:

${EXPLANATION_OF_METHODS_TO_ADD_RECORDER}
`;
