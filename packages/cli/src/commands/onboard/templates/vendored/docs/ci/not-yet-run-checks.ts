import {
  GITHUB_ACTIONS_SETUP_URL,
  MAKE_CHECK_BLOCKING_URL,
} from "src/lib/utils/internal-urls/docs-urls.utils";
import { METICULOUS_GITHUB_CHECK_NAME } from "@alwaysmeticulous/webapp-frontend-backend-shared";
import { INITIALIZE_WITH_SUCCESSFUL_CHECK_CHECKBOX_LABEL } from "src/components/project/overview/settings/ci-settings/not-yet-run-pull-request-commit-check.component";

export const document = `---
{
  "title": "Create Meticulous check in 'success' state until tests start running"
}
---

# {% $frontmatter.title %}

In the default Meticulous setup you'll have a workflow that builds your app and invokes the
[Meticulous GitHub Action](${GITHUB_ACTIONS_SETUP_URL}) (\`upload-assets\` or \`upload-container\` depending on how your app is served). Say you name this workflow '*trigger-meticulous-tests.yml*'. You can
make Meticulous a blocking check by marking the '*${METICULOUS_GITHUB_CHECK_NAME}*' check as
a [required check](${MAKE_CHECK_BLOCKING_URL}). The build process would therefore look like this:

 1. Your '*trigger-meticulous-tests.yml*' GitHub workflow is triggered (e.g. when a PR is opened). The '*${METICULOUS_GITHUB_CHECK_NAME}*' check
    has not been created yet, since the Meticulous tests have not started yet, and since you've marked '*${METICULOUS_GITHUB_CHECK_NAME}*' as
    a required check the PR will not be able to be merged yet.
 2. Once the build and pre-steps complete, the Meticulous action is invoked. This creates a second check on the PR, normally
    named '*${METICULOUS_GITHUB_CHECK_NAME}*'. This check will show as pending until the tests complete. If there are unapproved differences it
    will show as a failure, and will be updated to success when the differences are approved. Since you've marked the '*${METICULOUS_GITHUB_CHECK_NAME}*'
    check as a required check, the PR will not be able to be merged until the differences are approved.
 3. Finally the '*trigger-meticulous-tests.yml*' workflow will complete, and be marked as success.

{% callout type="warning" %}
**Multiple projects for the same repository:** If you have more than one Meticulous project connected to the same GitHub repository (e.g. for testing different app variants or environments), the check name will include the project name — for example, *'Meticulous Tests (my-project)'* instead of *'${METICULOUS_GITHUB_CHECK_NAME}'*. Make sure your required status checks use the correct name. If you later add a second project to a repo that previously only had one, the check name will change and you'll need to update your branch protection rules accordingly.
{% /callout %}

However having the '*${METICULOUS_GITHUB_CHECK_NAME}*' check as a required check can cause issues in a couple of scenarios:

 1. If you use merge queues. In this case you don't want Meticulous to post a failed check if diffs are detected at the merge queue stage,
    since that would block the merge queue from merging. Any differences should have already been approved before the PR was added to the
    merge queue. It is therefore standard to skip the Meticulous workflow for merge queue triggers. However, if Meticulous is a
    [required checks](${MAKE_CHECK_BLOCKING_URL}) then the merge queue would be indefinitely blocked because it'd be waiting for a check
    that is never created.
 2. If you don't trigger Meticulous for every pull request. In this case you don't want to block merging PRs where Meticulous doesn't run
    (i.e. no Meticulous check was ever created).

There are two ways of solving these issues:

 1. Tick the '*${INITIALIZE_WITH_SUCCESSFUL_CHECK_CHECKBOX_LABEL}*' option in your Meticulous project settings.
    This will cause Meticulous to register GitHub webhooks to monitor for new pull requests, new commit pushes, and for pull requests added
    to merge queues. It will then create a successful '*${METICULOUS_GITHUB_CHECK_NAME}*' check in each of these cases straight away. This
    check will start off as 'success' and turn to 'pending' when and if the Meticulous tests start running. If the Meticulous tests never run
    then the check will be successful, and the PR can merge. This does however mean that developers will be able to merge pull requests in
    the period between the PR being opened and the Meticulous tests being triggered after the build or deployment completes.
 2. Use a GitHub action such as [wait-for-checks](https://github.com/marketplace/actions/wait-for-checks) that only waits for checks that
    are actually triggered, rather than waiting for a hard coded list of checks even if some of them are never triggered on some PRs. As long
    as a GitHub workflow is running or a check pending while the application is being built prior to the Meticulous tests being triggered then
    the PR will not be able to be merged until the tests complete. However if you trigger the Meticulous tests indirectly by creating a GitHub
    deployment then there is a risk the PR will be mergeable in the handful of seconds between the workflow that creates the deployment completing
    and Meticulous receiving the GitHub webhook for the new deployment and starting the tests.
`;
