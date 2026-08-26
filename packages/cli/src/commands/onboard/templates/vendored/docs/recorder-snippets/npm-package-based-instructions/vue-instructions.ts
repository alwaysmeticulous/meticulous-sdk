import { recorderLoaderInstructions } from "./any-other-framework-instructions";

// Based on https://github.com/gothinkster/vue-realworld-example-app
const vueSnippet = ({
  constants,
  launchRecorderCode,
}: {
  constants: string;
  launchRecorderCode: string;
}) => `import Vue from "vue";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import { tryLoadAndStartRecorder } from '@alwaysmeticulous/recorder-loader'
${constants}
async function startApp() {${launchRecorderCode}

    // Initialise app after the Meticulous recorder is ready, e.g.
    new Vue({
      router,
      store,
      render: h => h(App)
    }).$mount("#app");
}

function isProduction() {
    // TODO: Update me with your production hostname
    return window.location.hostname.indexOf("your-production-site.com") > -1;
}

startApp();
`;

export const vueInstructions = recorderLoaderInstructions({
  title: "Installing on Vue",
  appEntryPointDescription: "app entry point",
  appEntryPointExampleFileName: "`main.js` or `main.ts`",
  snippetTemplate: vueSnippet,
});
