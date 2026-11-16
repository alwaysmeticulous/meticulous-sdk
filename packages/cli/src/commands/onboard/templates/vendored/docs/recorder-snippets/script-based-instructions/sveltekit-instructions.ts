import {
  METICULOUS_SETUP_CALENDLY_LINK,
  METICULOUS_SUPPORT_EMAIL,
} from "src/lib/next/next.constants";
import { ENSURE_RECORDER_CAPTURES_ALL_REQUESTS_URL } from "src/lib/utils/internal-urls/docs-urls.utils";
import { SNIPPET_URL } from "../constants";

// Tested on https://github.com/davjhan/guess-the-year-game
// (note: you need to delete all davjhan-core references, or manually checkout the davjhan-core repo)
export const svelteKitInstructions = (
  injectSessionIdHeader = false,
) => `**(A)** Add the Meticulous recorder script tag in a \`<svelte:head>\` tag at the top of your \`__layout.svelte\` file. It's important the script is the
first script, and async and defer are not set to true ([learn more](${ENSURE_RECORDER_CAPTURES_ALL_REQUESTS_URL})):

{% code_with_project_selector %}
{% tabs tabNameSpace="env" %}
{% tab label="Dev & Staging Only" %}
\`\`\`svelte
<svelte:head>
{#if !import.meta.env.PROD}
  <script
    data-recording-token="{% project_recording_token /%}"
    data-is-production-environment="false"${
      injectSessionIdHeader ? '\n    data-inject-session-id-header="true"' : ""
    }
    src="${SNIPPET_URL}"
  ></script>
{/if}
</svelte:head>
\`\`\`
{% /tab %}
{% tab label="All Environments" %}
\`\`\`svelte
<svelte:head>
  <script
    data-recording-token="{% project_recording_token /%}"
    data-is-production-environment={import.meta.env.PROD}${
      injectSessionIdHeader ? '\n    data-inject-session-id-header="true"' : ""
    }
    src="${SNIPPET_URL}"
  ></script>
</svelte:head>
\`\`\`
{% /tab %}
{% /tabs %}
{% /code_with_project_selector %}

**(B)** In your app.html, make sure that \`%svelte.head%\` is above any other scripts in the \`<head>\` tag:

Good:

{% code %}
\`\`\`html
<head>
    %svelte.head%
    <script src="another-script.js"></script>
</head>
\`\`\`
{% /code %}

Bad:

{% code %}
\`\`\`html
<head>
    <script src="another-script.js"></script>
    %svelte.head%
</head>
\`\`\`
{% /code %}

**(C)** Wire through the MODE environment variable, and make sure MODE is set to \`production\` only for production builds:

Add \`mode: process.env.MODE || 'development'\` to the \`vite\` section of your \`kit\` config in your \`svelte.config.js\` file. For example:

{% code %}
\`\`\`javascript
const config = {
  kit: {
      vite: {
          // default to development as a guard
          mode: process.env.MODE || 'development',
      }
  },
}
\`\`\`
{% /code %}

For all builds that get deployed to production, build your application using:

\`\`\`bash
MODE=production npm run build
\`\`\`

And for all other builds, including builds that get deployed to staging stacks and preview URLs, build your app using:

\`\`\`bash
MODE=development npm run build
\`\`\`

or

\`\`\`bash
MODE=staging npm run build
\`\`\`


**(D)** If you want to test your server side rendered content, then contact us

By default Meticulous will stub out all requests to server side rendered pages, and so won't test server side rendered content. If you
use server side rendering and wish to test your server side rendered pages then please reach out to
[${METICULOUS_SUPPORT_EMAIL}](mailto:${METICULOUS_SUPPORT_EMAIL}), or [book a call with us](${METICULOUS_SETUP_CALENDLY_LINK}), and we'll help you get set up.
`;
