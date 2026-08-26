import {
  METICULOUS_SETUP_CALENDLY_LINK,
  METICULOUS_SUPPORT_EMAIL,
} from "src/lib/next/next.constants";
import {
  ENSURE_RECORDER_CAPTURES_ALL_REQUESTS_URL,
  TYPESCRIPT_TYPES_URL,
} from "src/lib/utils/internal-urls/docs-urls.utils";
import { SNIPPET_URL } from "../constants";

export const storybookInstructions = (
  injectSessionIdHeader = false,
) => `If you want to record sessions using Storybook, you can add the Meticulous recorder script tag by
creating a \`.storybook/preview-head.html\` file and adding the following:

{% code_with_project_selector %}
\`\`\`html
<script
  data-recording-token="{% project_recording_token /%}"
  data-is-production-environment="false"${
    injectSessionIdHeader ? '\n  data-inject-session-id-header="true"' : ""
  }
  src="${SNIPPET_URL}"
></script>
<script>
  // Record and replay Storybook events sent from the parent (manager) to the
  // component iframe. These events capture interactions in Storybook controls
  // and actions (e.g., switching between stories).
  if (window.Meticulous?.replay) {
    window.Meticulous.replay.addCustomEventListener(
      "storybook-event",
      (serializedData) =>
        window.postMessage(serializedData, "*")
      ,
    )
  } else {
    window.addEventListener("message", event => {
      // Check if it's a storybook event
      try {
        const data = JSON.parse(event.data)
        if (data.key === "storybook-channel") {
          if (window.Meticulous?.record) {
            window.Meticulous.record.recordCustomEvent(
              "storybook-event",
              event.data,
            )
          }
        }
      } catch (e) {
        // Not a JSON message, ignore
      }
    })
  }
</script>
\`\`\`
{% /code_with_project_selector %}

For TypeScript type definitions for the \`window.Meticulous\` object, see [TypeScript Types for window.Meticulous](${TYPESCRIPT_TYPES_URL}).
`;
