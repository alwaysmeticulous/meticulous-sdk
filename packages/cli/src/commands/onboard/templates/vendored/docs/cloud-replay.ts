import {
  CREATE_DEPLOYMENTS_ON_GITHUB_URL,
  GITHUB_ACTIONS_SETUP_URL,
  MAKE_CHECK_BLOCKING_URL,
} from "src/lib/utils/internal-urls/docs-urls.utils";
import {
  METICULOUS_GITHUB_APP_INSTALL_URL,
  METICULOUS_VERCEL_INTEGRATION_INSTALL_URL,
} from "./constants";
import { linkGitLabInstructions } from "./how-to/link-gitlab";
import { METICULOUS_SUPPORT_EMAIL } from "src/lib/next/next.constants";

export const document = `---
{
  "title": "Running tests against existing deployment URLs"
}
---

# {% $frontmatter.title %}

{% callout_card variant="info" title="Preferred: Upload static assets or a container image" %}
If possible, we recommend [running tests via your CI pipeline](${GITHUB_ACTIONS_SETUP_URL}) by uploading static assets or a container image. These approaches are simpler and more reliable. Use deployment URL testing only if those options are not possible for your app.
{% /callout_card %}

{% tabs %}
{% tab label="GitHub" %}

If you use Vercel, Netlify, Cloudflare Pages or a similar system to generate PR preview URLs you can use the Meticulous GitHub app to test your PRs for you:

#### **Step 1: Install the Meticulous GitHub app**

Begin by [installing the Meticulous GitHub app](${METICULOUS_GITHUB_APP_INSTALL_URL}).

#### **Step 2: Integrate with your preview URL provider**

Once the GitHub app is installed, select the system you use to generate PR preview links:

{% tabs tabNameSpace="preview-provider" %}
{% tab label="Vercel" %}

Install the [Meticulous Vercel integration](${METICULOUS_VERCEL_INTEGRATION_INSTALL_URL}) and link your Vercel project in Meticulous.

If you have multiple Vercel projects for your GitHub repo, or multiple environments that you deploy the same branches/commits to, then you'll
need to let Meticulous know which environments it should run the tests against. You can do so by navigating to your project page and clicking on the *'Settings'* tab.

{% /tab %}
{% tab label="Netlify" %}

If you use Netlify you can configure a Netlify webhook so tests are triggered when new preview deploys are ready. Contact
[${METICULOUS_SUPPORT_EMAIL}](mailto:${METICULOUS_SUPPORT_EMAIL}) for help setting this up.

{% /tab %}
{% tab label="Cloudflare" %}

If you use Cloudflare pages you can configure a Cloudflare webhook so tests are triggered when new preview deploys are ready. Contact
[${METICULOUS_SUPPORT_EMAIL}](mailto:${METICULOUS_SUPPORT_EMAIL}) for help setting this up.

{% /tab %}
{% tab label="Other/Home-Grown" %}

If you use another preview URL system, or a home grown system you can generate
a GitHub deployment (environment) whenever a commit is pushed to a branch. This can then in turn be used to trigger a Meticulous test run
against the new deployment.

You can view instructions for how to do this [here](${CREATE_DEPLOYMENTS_ON_GITHUB_URL}), however it can be
fragile to set up correctly, and requires your PR preview system to have immutable, long-lived preview URLs and use identical
build settings across PR branches and main branch commits (to avoid false screenshot diffs). For this reason we recommend
[triggering Meticulous from your CI pipeline instead](${GITHUB_ACTIONS_SETUP_URL}), if possible.

{% /tab %}
{% /tabs %}

#### **Step 3 (optional): Make the Meticulous check blocking**

Whenever you open a new pull request Meticulous will now simulate a set of sessions against the preview URL before and after the PR, and post
a comment to the PR notifying of any changes spotted.

If you wish, you can make this check blocking by following the instructions [here](${MAKE_CHECK_BLOCKING_URL}). Doing so will prevent developers
from merging a PR which has visual differences until they have clicked the button to acknowledge the differences.

{% /tab %}
{% tab label="GitLab" %}

## Initial setup

If you use Vercel, Netlify or a similar system to generate PR preview URLs, you can use Meticulous to test your PRs.
To set this up:

${linkGitLabInstructions}

## Further steps

{% tabs %}
{% tab label="Vercel" %}

Please let us know that you are using Vercel preview URLs in the email you sent us when setting up GitLab.
After some setup on our side Meticulous will automatically run tests against Vercel preview URLs whenever a new deployment is ready.

{% /tab %}
{% tab label="Other preview URL providers" %}

Call the */test-runs/trigger* endpoint from your GitLab CI pipeline whenever a new commit is pushed to a branch with an open MR.
The endpoint will trigger a test run, and Meticulous will handle setting commit statuses and posting notes to the merge request as
the test run progresses.

{% code_with_project_selector %}
\`\`\`http
POST https://app.meticulous.ai/api/test-runs/trigger

Headers: {
  authorization: "{% api_token /%}"
  Content-Type: "application/json"
}

Body: {
  headSha: string, // the SHA of the commit you want to test
  headDeploymentUrl: string, // preview URL of headSha
  baseSha: string, // the SHA of the commit which the new test run will be compared against
  baseDeploymentUrl: string // preview URL of baseSha
}
\`\`\`
{% /code_with_project_selector %}

There are two different types of pipelines that GitLab can trigger when a new commit is pushed to a branch with an open MR: *merge request
pipelines* and *merged results pipelines* ([GitLab docs](https://docs.gitlab.com/ee/ci/pipelines/merged_results_pipelines.html)). Your
pipeline should call the */test-runs/trigger* endpoint with different values for \`headSha\` and \`baseSha\` depending on which type of
pipeline you use.

If you use merge request pipelines:
- \`headSha\` should be the SHA of the commit that was just pushed to the branch. This is exposed in the CI pipeline as
\`$CI_COMMIT_SHA\`.
- \`baseSha\` should be the SHA of the commit from which the branch was created. This is exposed in the CI pipeline as
\`$CI_MERGE_REQUEST_DIFF_BASE_SHA\`.

If you use merged results pipelines:
- \`headSha\` should be the SHA of the merge commit. This is exposed in the CI pipeline as \`$CI_COMMIT_SHA\`.
- \`baseSha\` should be the SHA of the HEAD commit on the target branch. This is exposed in the CI pipeline as
\`$CI_MERGE_REQUEST_TARGET_BRANCH_SHA\`.

{% /tab %}
{% /tabs %}

{% /tab %}
{% /tabs %}
`;
