import { METICULOUS_SETUP_CALENDLY_LINK } from "src/lib/next/next.constants";
import {
  INSTALLATION_INSTRUCTIONS_ANCHOR,
  INSTALL_RECORDER_AS_SCRIPT_TAG_INSTALLATION_INSTRUCTIONS_URL,
} from "src/lib/utils/internal-urls/docs-urls.utils";
import { angularInstructions } from "../recorder-snippets/npm-package-based-instructions/angular-instructions";
import {
  anyOtherFrameworkSnippet,
  recorderLoaderInstructions,
} from "../recorder-snippets/npm-package-based-instructions/any-other-framework-instructions";
import { STEPS_AFTER_INSTALLING_RECORDER } from "../recorder-snippets/steps-after-installing-recorder";
import { vueInstructions } from "../recorder-snippets/npm-package-based-instructions/vue-instructions";

const BOOK_A_CALL_TIP = `If you have any issues setting up the recorder then click [here](${METICULOUS_SETUP_CALENDLY_LINK}) to book a call with us.`;

const POST_TAB_CONTENT = `
If you have any cross-origin or sandboxed iFrames then the recorder should be added to each of these iFrames as well as the main frame. ${BOOK_A_CALL_TIP}

${STEPS_AFTER_INSTALLING_RECORDER}
`;

export const document = `---
{
  "title": "Set up session recording using an NPM dependency"
}
---

# {% $frontmatter.title %}

{% callout_card variant="warning" title="Script tag is the recommended installation method" %}
We recommend [installing the recorder via a script tag](${INSTALL_RECORDER_AS_SCRIPT_TAG_INSTALLATION_INSTRUCTIONS_URL}) instead. The script tag is the only way to fully guarantee that the recorder initializes before any other scripts execute, ensuring Meticulous can capture all network responses. Only use the NPM package if you cannot template your HTML to conditionally include the script tag.
{% /callout_card %}

{% anchor id="${INSTALLATION_INSTRUCTIONS_ANCHOR}" /%}

Please select your framework:

{% tabs direction="grid" noTabSelectedByDefault=true %}
{% tab label="Angular" %}
${angularInstructions}

${POST_TAB_CONTENT}
{% /tab %}
{% tab label="Vue" %}
${vueInstructions}

${POST_TAB_CONTENT}
{% /tab %}

{% tab label="React or any other framework" %}
${recorderLoaderInstructions({
  title: "Installing on any other framework",
  appEntryPointDescription: "app entry point",
  appEntryPointExampleFileName: "`index.js` or `main.js`",
  snippetTemplate: anyOtherFrameworkSnippet,
})}

${POST_TAB_CONTENT}
{% /tab %}

{% /tabs %}
`;
