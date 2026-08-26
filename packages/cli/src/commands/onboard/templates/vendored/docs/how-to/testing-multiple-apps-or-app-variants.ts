import { METICULOUS_SUPPORT_EMAIL } from "src/lib/next/next.constants";
import { BASE_URL_EXPLANATION_URL } from "src/lib/utils/internal-urls/docs-urls.utils";

export const document = `---
{
  "title": "Testing Multiple Apps or App Variants"
}
---

# {% $frontmatter.title %}

### I have a single app, but with multiple variants deployed under different configurations to different URLs. How do I use Meticulous to test them?

When Meticulous simulates sessions it is configured to simulate the sessions against a particular base URL - for example the \`report-diffs-action\` \`appUrl\` or the URL of the Vercel deployment. This URL will
normally be different to the URL the session was recorded at. When simulating a session, Meticulous takes the URL the session was recorded at and swaps out the origin with the new base URL. Learn more [here](${BASE_URL_EXPLANATION_URL}).

You'll therefore need to make sure that the base URL you are simulating sessions against serves up the same app under the same configuration as the base URL sessions are recorded on.

If you have multiple URLs that serve different variants of your app, for example, customized for different customers, then you can set up multiple Meticulous projects and multiple Vercel deployments or \`report-diffs-action\` calls - one to test each variant of the app using the sessions recorded for that variant. See below for more details.

### I have multiple independent apps in the same monorepo. How do I use Meticulous to test them?

You'll most likely want to set up multiple Meticulous projects for the same GitHub repo. Each Meticulous project will have its own recording token, allowing you
to set up each app to record sessions in a different Meticulous project.

If you're using Github Actions to run Meticulous in CI you can then set up a separate call
to \`report-diffs-action\` for each Meticulous project, passing in the API token of the relevant project, and pointing it to a URL that serves the correct application.

If you're using Vercel, or another service that provides preview URLs, then you'll want to configure Vercel deployments for each application separately.
Navigate to the project settings page for each Meticulous project and configure that project to test against only the relevant Vercel deployments by
selecting the appropriate environments in the \`Environments to Test Against\` section.

### GitHub check names with multiple projects

When you have multiple Meticulous projects connected to the same GitHub repository, the GitHub status check name includes the project name to differentiate them. For example, instead of *'Meticulous Tests'*, the checks will be named *'Meticulous Tests (project-a)'* and *'Meticulous Tests (project-b)'*.

If you have Meticulous configured as a [required check](/docs/make-check-blocking) in your branch protection rules, make sure the required check names match the actual check names. Adding a second project to a repo that previously only had one will change the check name, which can cause PRs to hang waiting for a check that no longer exists under the old name.

Reach out to [${METICULOUS_SUPPORT_EMAIL}](mailto:${METICULOUS_SUPPORT_EMAIL}) and we'll help you get set up.
`;
