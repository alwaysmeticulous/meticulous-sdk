import {
  ENSURE_RECORDER_CAPTURES_ALL_REQUESTS_URL,
  INSTALL_RECORDER_AS_SCRIPT_TAG_INSTALLATION_INSTRUCTIONS_URL,
  INSTALL_RECORDER_AS_NPM_DEPENDENCY_INSTALLATION_INSTRUCTIONS_URL,
} from "src/lib/utils/internal-urls/docs-urls.utils";

export const EXPLANATION_OF_METHODS_TO_ADD_RECORDER = `
There are two ways to add the Meticulous recorder to your web application:
 1. [By inserting it as script tag](${INSTALL_RECORDER_AS_SCRIPT_TAG_INSTALLATION_INSTRUCTIONS_URL}) **(recommended)**
 2. [By installing an NPM package](${INSTALL_RECORDER_AS_NPM_DEPENDENCY_INSTALLATION_INSTRUCTIONS_URL})

If possible, we recommend that you use the **script tag** as it is the only way to fully guarantee that the recorder
initializes before any other scripts execute, thereby ensuring Meticulous can capture all network responses
([learn more](${ENSURE_RECORDER_CAPTURES_ALL_REQUESTS_URL})).

For bundler-based setups such as Vite, rsbuild, and Nuxt, our script tag instructions use the \`@alwaysmeticulous/recorder-plugin\`
dev dependency to inject the script automatically at build time.

However, if it's not possible to template your HTML so that the script tag is only included in the environments where you
want to record sessions then you can use [the loader package instead](${INSTALL_RECORDER_AS_NPM_DEPENDENCY_INSTALLATION_INSTRUCTIONS_URL}).
`;
