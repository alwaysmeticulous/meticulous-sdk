import { ENSURE_RECORDER_CAPTURES_ALL_REQUESTS_URL } from "src/lib/utils/internal-urls/docs-urls.utils";

export const viteInstructions = (
  injectSessionIdHeader = false,
) => `Install the Meticulous recorder plugin and add it to your Vite config. The plugin injects the recorder script as the first script tag in your app's \`<head>\`, with no async or defer attributes ([learn more](${ENSURE_RECORDER_CAPTURES_ALL_REQUESTS_URL})).

{% code %}
\`\`\`shell
npm install @alwaysmeticulous/recorder-plugin@latest --save-dev
\`\`\`
{% /code %}

Modify your \`vite.config.ts\` file to include the plugin:

{% code_with_project_selector %}
{% tabs tabNameSpace="env" %}
{% tab label="Dev Only (default)" %}
\`\`\`typescript
import { defineConfig } from "vite";
import meticulous from "@alwaysmeticulous/recorder-plugin/vite";

export default defineConfig({
  plugins: [
    meticulous({
      recordingToken: "{% project_recording_token /%}",${
        injectSessionIdHeader
          ? '\n      attributes: { "data-inject-session-id-header": "true" },'
          : ""
      }
    }),
  ],
});
\`\`\`
{% /tab %}
{% tab label="All Environments" %}
\`\`\`typescript
import { defineConfig } from "vite";
import meticulous from "@alwaysmeticulous/recorder-plugin/vite";

export default defineConfig({
  plugins: [
    meticulous({
      recordingToken: "{% project_recording_token /%}",
      enabled: "always",${
        injectSessionIdHeader
          ? '\n      attributes: { "data-inject-session-id-header": "true" },'
          : ""
      }
    }),
  ],
});
\`\`\`
{% /tab %}
{% /tabs %}
{% /code_with_project_selector %}

By default, the plugin injects the recorder only during Vite development builds. If you set \`enabled: "always"\`, the plugin will inject the recorder in every environment and automatically set \`data-is-production-environment\` based on Vite's detected mode.
`;
