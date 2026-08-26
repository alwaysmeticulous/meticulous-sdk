export interface SnippetTemplateOpts {
  constants: string;
  launchRecorderCode: string;
}

export type SnippetTemplate = (opts: SnippetTemplateOpts) => string;

export const anyOtherFrameworkSnippet = ({
  constants,
  launchRecorderCode,
}: {
  constants: string;
  launchRecorderCode: string;
}) => `import { tryLoadAndStartRecorder } from '@alwaysmeticulous/recorder-loader'
${constants}
async function startApp() {${launchRecorderCode}

    // Initialise app after the Meticulous recorder is ready, e.g.
    ReactDOM.render(component, document.getElementById('root'));
}

function isProduction() {
    // TODO: Update me with your production hostname
    return window.location.hostname.indexOf("your-production-site.com") > -1;
}

startApp();
`;

export const devAndStagingOnlyOpts: SnippetTemplateOpts = {
  constants: "",
  launchRecorderCode: `
    // Record all sessions on localhost, staging stacks and preview URLs
    if (!isProduction()) {
      // Start the Meticulous recorder before you initialise your app.
      // Note: all errors are caught and logged, so no need to surround with try/catch
      await tryLoadAndStartRecorder({
        recordingToken: '{% project_recording_token /%}',
        isProduction: false,
      });
    }`,
};

const allEnvironmentsOpts: SnippetTemplateOpts = {
  constants: `
// Record 1% of production sessions
const METICULOUS_SAMPLING_RATE = 0.01;
`,
  launchRecorderCode: `
    if (!isProduction() || Math.random() < METICULOUS_SAMPLING_RATE) {
      // Start the Meticulous recorder before you initialise your app.
      // Note: all errors are caught and logged, so no need to surround with try/catch
      await tryLoadAndStartRecorder({
        recordingToken: '{% project_recording_token /%}',
        isProduction: isProduction(),
        maxMsToBlockFor: isProduction() ? 250 : undefined, // Optional, abandon waiting to load the Meticulous recorder, if it takes more than 250ms
      });
    }
`,
};

export const recorderLoaderInstructions = ({
  title,
  appEntryPointDescription,
  appEntryPointExampleFileName,
  snippetTemplate,
}: {
  title: string | null;
  appEntryPointDescription: string;
  appEntryPointExampleFileName: string;
  snippetTemplate: SnippetTemplate;
}) => `
${title ? `### ${title}` : ""}

**Step A)** Add a dependency on the \`@alwaysmeticulous/recorder-loader\` package:

{% command_card_block %}
\`\`\`bash
npm install @alwaysmeticulous/recorder-loader
\`\`\`
{% /command_card_block %}

or

{% command_card_block %}
\`\`\`bash
yarn add @alwaysmeticulous/recorder-loader
\`\`\`
{% /command_card_block %}

**Step B)** In your ${appEntryPointDescription} call \`await tryLoadAndStartRecorder({ ... })\` before your app initialisation logic.
It is important to initialise the Meticulous recorder before your app initialises in order to capture all
network requests / user interactions correctly.


For example your ${appEntryPointExampleFileName} might contain something like:

{% code_with_project_selector %}
{% tabs %}
{% tab label="Dev & Staging Only" %}
\`\`\`typescript
${snippetTemplate(devAndStagingOnlyOpts)}
\`\`\`
{% /tab %}
{% tab label="All Environments" %}
\`\`\`typescript
${snippetTemplate(allEnvironmentsOpts)}
\`\`\`
{% /tab %}
{% /tabs %}
{% /code_with_project_selector %}`;

const anyOtherFrameworkInstructions = recorderLoaderInstructions({
  title: "Installing on any other framework",
  appEntryPointDescription: "app entry point",
  appEntryPointExampleFileName: "`index.js` or `main.js`",
  snippetTemplate: anyOtherFrameworkSnippet,
});
