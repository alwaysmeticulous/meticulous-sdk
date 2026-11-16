import { recorderLoaderInstructions } from "./any-other-framework-instructions";

// Based on https://angular.io/generated/live-examples/getting-started/stackblitz.html
const angularSnippet = ({
  constants,
  launchRecorderCode,
}: {
  constants: string;
  launchRecorderCode: string;
}) => `import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';
import { tryLoadAndStartRecorder } from '@alwaysmeticulous/recorder-loader'
${constants}
async function startApp() {${launchRecorderCode}

    // Initialise app after the Meticulous recorder is ready, e.g.
    platformBrowserDynamic().bootstrapModule(AppModule)
        .catch(err => console.error(err));
}

function isProduction() {
    // TODO: Update me with your production hostname
    return window.location.hostname.indexOf("your-production-site.com") > -1;
}

startApp();
`;

export const angularInstructions = recorderLoaderInstructions({
  title: "Installing on Angular",
  appEntryPointDescription: "app entry point",
  appEntryPointExampleFileName: "`main.js` or `main.ts`",
  snippetTemplate: angularSnippet,
});
