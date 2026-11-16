import { METICULOUS_SETUP_CALENDLY_LINK } from "src/lib/next/next.constants";
import {
  INSTALLATION_INSTRUCTIONS_ANCHOR,
  INSTALL_RECORDER_AS_NPM_DEPENDENCY_INSTALLATION_INSTRUCTIONS_URL,
  NEXTJS_APP_ROUTER_ADDITIONAL_SETUP_URL,
} from "src/lib/utils/internal-urls/docs-urls.utils";
import { SNIPPET_URL } from "../recorder-snippets/constants";
import { nextJsInstructions } from "../recorder-snippets/script-based-instructions/next-js-instructions";
import { nuxtJsInstructions } from "../recorder-snippets/script-based-instructions/nuxtjs-instructions";
import { rsbuildInstructions } from "../recorder-snippets/script-based-instructions/rsbuild-instructions";
import { storybookInstructions } from "../recorder-snippets/script-based-instructions/storybook-instructions";
import { svelteKitInstructions } from "../recorder-snippets/script-based-instructions/sveltekit-instructions";
import { viteInstructions } from "../recorder-snippets/script-based-instructions/vite-instructions";
import { scriptRequirementsCalloutCard } from "../recorder-snippets/script-requirements";
import { STEPS_AFTER_INSTALLING_RECORDER } from "../recorder-snippets/steps-after-installing-recorder";

const BOOK_A_CALL_TIP = `If you have any issues setting up the recorder then click [here](${METICULOUS_SETUP_CALENDLY_LINK}) to book a call with us.`;

const POST_TAB_CONTENT = `
If you have any cross-origin or sandboxed iFrames then the recorder should be added to each of these iFrames as well as the main frame. ${BOOK_A_CALL_TIP}

${STEPS_AFTER_INSTALLING_RECORDER}
`;

export const document = `---
{
  "title": "Install the Meticulous recorder via a script tag"
}
---

{% anchor id="${INSTALLATION_INSTRUCTIONS_ANCHOR}" /%}
# {% $frontmatter.title %}

Please select your framework or build tool:

{% tabs direction="grid" noTabSelectedByDefault=true %}
{% tab label="NextJS with the /pages directory" %}
## Installing on NextJS with the /pages directory

${scriptRequirementsCalloutCard({ isNextJs: "yes" })}

Add a script tag to your \`_document.js\` file within \`Head\`. If the layout doesn't yet have a \`<Head>\` tag then
you can add one within the \`<Html>\` tag.

${nextJsInstructions("Head")}

${POST_TAB_CONTENT}
{% /tab %}
{% tab label="NextJS with the /app directory" %}
## Installing on NextJS with the /app directory

${scriptRequirementsCalloutCard({ isNextJs: "yes" })}

Add a script tag to your \`/app/layout.tsx\` or \`/app/layout.jsx\` file within \`head\`. If the layout doesn't yet have a \`<head>\` tag then
you can add one within the \`<html>\` tag.

${nextJsInstructions("head")}

After adding the snippet you'll need to follow a [few additional steps](${NEXTJS_APP_ROUTER_ADDITIONAL_SETUP_URL}) to ensure Meticulous can
correctly test your app.

${POST_TAB_CONTENT}
{% /tab %}
{% tab label="Nuxt" %}
## Installing on NuxtJS

${scriptRequirementsCalloutCard({ isNextJs: "no" })}

${nuxtJsInstructions()}

${POST_TAB_CONTENT}
{% /tab %}
{% tab label="SvelteKit" %}
## Installing on SvelteKit

${scriptRequirementsCalloutCard({ isNextJs: "no" })}

${svelteKitInstructions()}

${POST_TAB_CONTENT}
{% /tab %}
{% tab label="Vite" %}
## Installing on Vite

${scriptRequirementsCalloutCard({ isNextJs: "no" })}

${viteInstructions()}

${POST_TAB_CONTENT}
{% /tab %}
{% tab label="rsbuild" %}
## Installing on rsbuild

${scriptRequirementsCalloutCard({ isNextJs: "no" })}

${rsbuildInstructions()}

${POST_TAB_CONTENT}
{% /tab %}
{% tab label="Storybook" %}
## Installing on Storybook

${scriptRequirementsCalloutCard({ isNextJs: "no" })}

${storybookInstructions()}

${POST_TAB_CONTENT}
{% /tab %}
{% tab label="Any other framework or build tool" %}
## Installing on any other framework or build tool

${scriptRequirementsCalloutCard({ isNextJs: "no" })}

Add the recorder as the first script tag in your \`<head>\` tag. If you only want to record sessions in non-production environments then
you will need to template your HTML to only include the script tag in non-production environments (if this is not possible then you can
 [use an NPM dependency instead of a script tag](${INSTALL_RECORDER_AS_NPM_DEPENDENCY_INSTALLATION_INSTRUCTIONS_URL})).

{% code_with_project_selector %}
\`\`\`html
<head>
  ...
  <script
    data-recording-token="{% project_recording_token /%}"
    data-is-production-environment="<true/false>"
    src="${SNIPPET_URL}">
  </script>

  <!--Meticulous snippet should be added before your app -->
  ...
  <script src="main_app.js"></script>
</head>
\`\`\`
{% /code_with_project_selector %}

${POST_TAB_CONTENT}
{% /tab %}

{% /tabs %}
`;
