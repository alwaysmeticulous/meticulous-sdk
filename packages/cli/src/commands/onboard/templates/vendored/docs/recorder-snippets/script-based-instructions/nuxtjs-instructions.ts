import {
  METICULOUS_SETUP_CALENDLY_LINK,
  METICULOUS_SUPPORT_EMAIL,
} from "src/lib/next/next.constants";
import { ENSURE_RECORDER_CAPTURES_ALL_REQUESTS_URL } from "src/lib/utils/internal-urls/docs-urls.utils";

// Tested on https://github.com/digitalocean/sample-nuxtjs
export const nuxtJsInstructions = (
  injectSessionIdHeader = false,
) => `Install the Meticulous recorder plugin and add it to your Nuxt config. The plugin injects the recorder script as the first script tag in your app's \`<head>\`, with no async or defer attributes ([learn more](${ENSURE_RECORDER_CAPTURES_ALL_REQUESTS_URL})).

{% code %}
\`\`\`shell
npm install @alwaysmeticulous/recorder-plugin@latest --save-dev
\`\`\`
{% /code %}

Modify your \`nuxt.config.ts\` file to include the plugin:

{% code_with_project_selector %}
{% tabs tabNameSpace="env" %}
{% tab label="Dev Only (default)" %}
\`\`\`typescript
export default defineNuxtConfig({
  modules: [
    [
      "@alwaysmeticulous/recorder-plugin/nuxt",
      ${
        injectSessionIdHeader
          ? `{
        recordingToken: "{% project_recording_token /%}",
        attributes: { "data-inject-session-id-header": "true" },
      }`
          : `{ recordingToken: "{% project_recording_token /%}" }`
      },
    ],
  ],
});
\`\`\`
{% /tab %}
{% tab label="All Environments" %}
\`\`\`typescript
export default defineNuxtConfig({
  modules: [
    [
      "@alwaysmeticulous/recorder-plugin/nuxt",
      {
        recordingToken: "{% project_recording_token /%}",
        enabled: "always",${
          injectSessionIdHeader
            ? '\n        attributes: { "data-inject-session-id-header": "true" },'
            : ""
        }
      },
    ],
  ],
});
\`\`\`
{% /tab %}
{% /tabs %}
{% /code_with_project_selector %}

By default, the plugin injects the recorder only during Nuxt development builds. If you set \`enabled: "always"\`, the plugin will inject the recorder in every environment and automatically set \`data-is-production-environment\` based on Nuxt's detected mode.

By default Meticulous will stub out all requests to server side rendered pages, and so won't test server side rendered content. If you
use server side rendering and wish to test your server side rendered pages then please reach out to
[${METICULOUS_SUPPORT_EMAIL}](mailto:${METICULOUS_SUPPORT_EMAIL}), or [book a call with us](${METICULOUS_SETUP_CALENDLY_LINK}), and we'll help you get set up.
`;
