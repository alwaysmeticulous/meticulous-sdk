import { METICULOUS_SUPPORT_EMAIL } from "src/lib/next/next.constants";
import { METICULOUS_WINDOW_OBJECT_URL } from "src/lib/utils/internal-urls/docs-urls.utils";
import { WHERE_CAN_I_REACH_OUT_FOR_SUPPORT } from "../constants";

const SERVER_SIDE_RENDERING_ANCHOR = "server-side-rendering";
const ENV_DIFFERENCES_ANCHOR = "env-differences";
const PAUSING_METICULOUS_REPLAYS_ANCHOR = "pausing-meticulous-replays";
const OTHER_CAUSES_ANCHOR = "other-causes";
const GENERAL_TECHNIQUES_ANCHOR = "general-techniques";

export const document = `---
{
  "title": "Fix False Positive Diffs"
}
---

# {% $frontmatter.title %}

## Overview

Ideally every difference you see in the Meticulous UI for a given PR should be directly caused by a code change introduced by that PR. Differences that
show up that are unrelated to your code change could be due to:

 - [Changes in content derived from database data, or the current date/time, when using server side rendering](#${SERVER_SIDE_RENDERING_ANCHOR}) (when using client side rendering Meticulous handles this automatically)
 - Or, [differences in how you build the code for the two different environments you're comparing between (e.g. PR build vs main branch build)](#${ENV_DIFFERENCES_ANCHOR})
 - Or, [executing asynchronous tasks that Meticulous doesn't natively handle](#${PAUSING_METICULOUS_REPLAYS_ANCHOR})
 - Or, [other causes](#${OTHER_CAUSES_ANCHOR})

In all of these cases, if you can't solve the underlying cause, then you can just mark the diff to be ignored:

{% anchor id="${GENERAL_TECHNIQUES_ANCHOR}" /%}
### Configuring certain diffs to be ignored

You can configure diffs inside certain elements to be ignored by adding a CSS selector to the
_'Elements to ignore when comparing screenshots'_ list in the _'Screenshotting behavior'_ section in project settings, or by adding the
\`meticulous-ignore\` class to an element.

Please note that if you open a pull request to add a \`meticulous-ignore\` class to an element then the ignore rule will only apply to Meticulous
test runs for new PRs opened since the original PR adding the \`meticulous-ignore\` class was merged.

Alternatively, you can detect if the app is being rendered as part of a Meticulous test, and disable part of the UI or code that is causing
false positive diffs when being rendered in a test. For frontend components you can use the [Meticulous object on the window](${METICULOUS_WINDOW_OBJECT_URL}),
and for server side components or server side rendering you can use the [\`meticulous-is-test\` header](#${SERVER_SIDE_RENDERING_ANCHOR}).

{% anchor id="${SERVER_SIDE_RENDERING_ANCHOR}" /%}
## Diffs due to changes in data or the current date when using server side rendering, or rendering NextJS server components

By default Meticulous stubs out responses for any fetch or XHR requests from the browser and stubs out the Date functions in the browser.
This means that even if the data in your database changes or the time changes you won't see any false positive diffs.

However if you're using NextJS server components then Meticulous will re-render those server components on the backend every time it replays
a session -- this means that if the data in your database changes or the date changes in the short window of time between when Meticulous
replays the session on the base commit and when Meticulous replays the session on the head commit, and you render that data or the date to
the page inside a server component, then you could see false positive diffs.

Meticulous sends a \`meticulous-is-test\` header in every request it makes to your NextJS server. You can use this header to disable parts of
your server components which cause flakes in Meticulous tests. It'll always be present (with value '1') if the request is being made as part
of a Meticulous test.

If you render text based on the current time (for example "Posted 7 minutes ago"), you can configure Meticulous to send a simulated date
header with the virtual time by adding a custom header in your project settings (Settings > Custom Request Headers). Use the
**Simulated Date** template to set the header value - this will be resolved per-request to the virtual time in RFC 7231 format.

For example, you could add a custom header named \`meticulous-simulated-date\` using the Simulated Date template, then use it like so:

\`\`\`javascript
import { headers } from 'next/headers'

const getCurrentDate = async () => {
  const requestHeaders = await headers()

  // If a simulated date header is configured in Meticulous project settings, use it instead of the current date
  const simulatedDate = requestHeaders.get('meticulous-simulated-date')
  return simulatedDate ? new Date(Date.parse(simulatedDate)) : new Date()
}
\`\`\`

This avoids false positive diffs due to the time changing (e.g. "Posted 7 minutes ago" vs "Posted 8 minutes ago"): Meticulous will send
the same timestamp every time for the same request. The timestamp is a UTC date in RFC 7231 format.

You can also [configure Meticulous to ignore the diffs using CSS selectors](#${GENERAL_TECHNIQUES_ANCHOR}).

{% anchor id="${ENV_DIFFERENCES_ANCHOR}" /%}
## Diffs due to differences between environments

### Using Vercel

If you use Vercel then Meticulous will try to automatically generate previews using the same environmental configuration for both commits to the main branch,
and to PR branches. So you shouldn't see any false positive diffs due to differences between environments. If you do, then reach out to
the [Meticulous support team](mailto:${METICULOUS_SUPPORT_EMAIL}).

### Using Netlify, or other preview providers

If you use another preview URL provider, such as Netlify, then Meticulous will compare visual snapshots from the preview URL of the base commit on the main branch to snapshots from the preview URL of the head commit of the pull request branch.

In this case the environment variables and configuration you use to run & build your app needs to be the same for the deployments of the main branch (production deploys) and the deployments of pull request branches (preview deploys). If this isn't the case Meticulous could display false screenshot differences.

For example if you configure production deploys of your app (from the main branch) to have a blue banner, and preview deploys of your app (from pull request branches)
 to have a red banner, then Meticulous would display screenshot diffs of the banner changing from blue to red for every screen. You want to make
 sure that the only screenshot diffs Meticulous shows are due to changes in the code introduced by the pull request being tested, rather than
 environmental differences between the environments tested on.

To fix this check the environment variables and configuration you use to run & build your app are the same for the deployments of the
main branch (production deploys) and the deployments of pull request branches (preview deploys).

If it's not possible to unify the configuration across the environments then you can [configure Meticulous to ignore the diffs](#${GENERAL_TECHNIQUES_ANCHOR}).

### Using GitHub Actions

If, instead of preview URLs, you're using the \`report-diffs-action\` GitHub action, then Meticulous will compare snapshots from running your app from the base
commit of the main branch to snapshots from running your app from the head commit of the pull request branch. In this case it's similarly important to make sure
that you compile and run your app with the same configuration for both the main branch and the pull request branches.

{% anchor id="${PAUSING_METICULOUS_REPLAYS_ANCHOR}" /%}
## Diffs due to asynchronous tasks not handled natively by Meticulous

Meticulous will automatically wait for most browser tasks to complete before continuing with javascript execution. This ensures the
resultant screenshots are deterministic. However, if your application waits for asynchronous events that are *not* handled natively by Meticulous
you can use the [Meticulous object on the window](${METICULOUS_WINDOW_OBJECT_URL}) to pause the execution of the replay while the
asynchronous task is in-progress.

For example, let's say you send a message to a custom Chrome extension and then wait for a response.
In this case you can tell Meticulous to pause the replay until you have received the expected response:

\`\`\`javascript
function sendMessageToExtension() {
  if (window.Meticulous?.isRunningAsTest) {
    // Meticulous will pause test execution for up to 30 seconds. If we don't
    // call pause() here Meticulous will sometimes take a screenshot before the
    // Chrome extension has responded, and sometimes after, causing flaky tests.
    window.Meticulous.replay.pause();
  }
  chrome.runtime.sendMessage(MY_EXTENSION_ID, "My message", (response) => {
    if (window.Meticulous?.isRunningAsTest) {
      // Important: we continue the replay even if the request fails
      window.Meticulous.replay.resume();
    }
    if (response.success) {
      doSomething(response.data);
    }
  });
}
\`\`\`

{% anchor id="${OTHER_CAUSES_ANCHOR}" /%}
## False positive diffs due to other reasons

Meticulous ensures the session simulation executes identically every time, even if there are animations, timers, random number generators,
changing data, or changing dates and times. So under normal operation false positive diffs or flakes should not happen.

However, if you are making extensive use of web workers, WebGL or WASM, it is possible that in some cases you could see false
positive diffs. If you do notice a false positive diff please reach out to the [Meticulous support team](mailto:${METICULOUS_SUPPORT_EMAIL}) and
we'll take a look into it. You can also [configure Meticulous to ignore the diffs](#${GENERAL_TECHNIQUES_ANCHOR}).

${WHERE_CAN_I_REACH_OUT_FOR_SUPPORT}
`;
