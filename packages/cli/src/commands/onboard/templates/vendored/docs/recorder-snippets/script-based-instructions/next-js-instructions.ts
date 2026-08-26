import { SNIPPET_URL } from "../constants";

export const nextJsInstructions = (
  headTag: "head" | "Head",
  injectSessionIdHeader = false,
) => `
{% code_with_project_selector %}
{% tabs tabNameSpace="env" %}
{% tab label="Dev & Staging Only" %}
\`\`\`jsx
<${headTag}>
  ...
      {(process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview") && (
        // eslint-disable-next-line @next/next/no-sync-scripts
        <script
          data-recording-token="{% project_recording_token /%}"
          data-is-production-environment="false"${
            injectSessionIdHeader
              ? '\n          data-inject-session-id-header="true"'
              : ""
          }
          src="${SNIPPET_URL}"
        />
      )}
  ...
</${headTag}>
\`\`\`
{% /tab %}
{% tab label="All Environments" %}
\`\`\`jsx
<${headTag}>
  ...
      // eslint-disable-next-line @next/next/no-sync-scripts
      <script
      data-recording-token="{% project_recording_token /%}"
      data-is-production-environment={process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production"}${
        injectSessionIdHeader
          ? '\n      data-inject-session-id-header="true"'
          : ""
      }
      src="${SNIPPET_URL}"
      />
  ...
</${headTag}>
\`\`\`
{% /tab %}
{% /tabs %}
{% /code_with_project_selector %}
`;
