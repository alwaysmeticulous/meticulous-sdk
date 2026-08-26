import {
  METICULOUS_SETUP_CALENDLY_LINK,
  METICULOUS_SUPPORT_EMAIL,
} from "src/lib/next/next.constants";
import {
  ENSURE_RECORDER_CAPTURES_ALL_REQUESTS_URL,
  FIX_FALSE_POSITIVES_URL,
  RECORD_AND_REPLAY_ON_DIFFERENT_ENVIRONMENTS_URL,
  TESTING_POOL_URL,
  TROUBLESHOOTING_FAILED_SIMULATIONS_STEPS_ANCHOR,
} from "src/lib/utils/internal-urls/docs-urls.utils";
import { METICULOUS_DEBUG_PR_LABEL, SIMULATION_TAB_NAMES } from "../constants";

export const document = `---
  {
    "title": "Troubleshoot Failed or Inaccurate Simulations"
  }
  ---

  # {% $frontmatter.title %}

  ## Some simulations on my PR test run are failing or inaccurate

  Simulations can fail or replay inaccurately for a few reasons:

  1. **The session is out of date**: Your application has changed significantly since the session was originally recorded, such that the session can't be replayed against
  the new version of your application. This could be due to UI changes, such that the session can't interact with the same elements. Or
  it could be due to your application's API changing, triggering errors when Meticulous replays old out-of-date network requests from the
  original session. Such failing replays can be safely ignored: Meticulous will automatically detect if the session is no longer able to cover certain code paths or user
  flows on your new codebase and select one or more new sessions, with new network responses and user interactions, to correctly cover these paths.
  2. **There is an error with your recorder setup**, for example [it's not being initialized early enough so not capturing all network responses](${ENSURE_RECORDER_CAPTURES_ALL_REQUESTS_URL}).
  3. **There are fundamental differences between the environment the session was recorded on and the environment it is being replayed in**, [such
  that sessions recorded on one environment can't be replayed on another](${RECORD_AND_REPLAY_ON_DIFFERENT_ENVIRONMENTS_URL}).

  Follow the steps below to distinguish between these causes and troubleshoot why simulations may be failing.

  {% anchor id="${TROUBLESHOOTING_FAILED_SIMULATIONS_STEPS_ANCHOR}" /%}
  ## Troubleshooting why simulations may be failing

  ### 1. Check if the user session can be simulated accurately *against the environment from which it was recorded*

  To verify whether the user session can be simulated accurately in the same environment in which it was recorded, you can:

  1. Find a session from the **All Sessions** or **Selected Sessions** tab of your {% project_link %}Meticulous dashboard{% /project_link %}.
  2. Follow the command to "Replay this session" on the **Simulate** tab of the session page.
  3. Note that if the session was originally recorded on localhost then the \`--appUrl\` flag will be set to a localhost URL, and you'll
  need to serve your app on that same port locally to replay the session (or edit the \`--appUrl\`).

  While simulating the session, keep an eye out for common symptoms of an unsuccessfully simulated session:
  - The simulation hits an error screen
  - The simulation fails to populate pages with data
  - The simulation hits an error state while navigating through a form and stays there for the duration of the simulation

  If you see any of these symptoms, and the application has changed somewhat since the session was first recorded, then the
  session is likely failing to replay because it is out of date, and there has since been a breaking API schema change or a breaking UI change.
  Such replay failures can be safely ignored: Meticulous will automatically detect if the session is no longer able to cover certain code paths or user
  flows on your new codebase and select one or more new sessions, with new network responses and user interactions, to correctly cover these paths. For
  more information on how Meticulous selects sessions, see [here](${TESTING_POOL_URL}).

  If the simulation was successful, proceed to the next troubleshooting step.

  ### 2. Check if the user session can be simulated accurately *against the environment used for test runs*

  To verify whether the user session can be simulated accurately in the environment used for test runs, you can:

  1. Navigate back to the session you selected in the previous step.
  2. Click on the **Simulations** tab to find a recent simulation in CI. You'll be able to tell it's a CI simulation since the 'Simulated Against'
  URL will show a Meticulous secure tunnel URL (\`*.tunnels.meticulous.ai\`) or a Vercel, Netlify or Cloudflare preview URL.
  3. Select one of the simulations and follow the command to "Re-run the simulation with the Meticulous CLI" on the **${SIMULATION_TAB_NAMES.DEBUG_LOCALLY}** tab of the simulation page.

  If you're triggering Meticulous tests in CI against Vercel, Netlify or Cloudflare preview URLs then you can run this command as is:
  the \`--appUrl\` it is set to run against will most likely still be a valid preview URL.

  If however you're triggering Meticulous tests in
  CI against a Meticulous secure tunnel URL or a localhost server running in your CI runner then you'll need to edit the \`--appUrl\` to point to a valid URL. If you're
  using the cloud replay action you can get a URL to run against by opening a new PR with \`${METICULOUS_DEBUG_PR_LABEL}\` in the title. This
  will keep the secure tunnel open for debugging. Meticulous will post a comment on your PR on how to access the secure tunnel to debug
  your application setup, and you can use this as the \`--appUrl\` to replay the simulation against. It will also post a username and password
  which you must make available as \`METICULOUS_TUNNEL_USERNAME\` and \`METICULOUS_TUNNEL_PASSWORD\` environment variables when running the Meticulous
  CLI.

  Look out for any of the symptoms described in step 1. If the simulation fails when simulating against the test run environment but not when simulating against the original recording
  environment then the issue is likely environmental differences between the recording and test run environments. For more
  information on how to debug environmental differences, see [here](${FIX_FALSE_POSITIVES_URL}).

  If the simulation was successful, please get in touch by emailing [${METICULOUS_SUPPORT_EMAIL}](mailto:${METICULOUS_SUPPORT_EMAIL}), or
  [book a call with us](${METICULOUS_SETUP_CALENDLY_LINK}), and we will help you debug this issue.

  ### 3. View the simulation timeline to see why it failed to replay

  Find the simulation in the Meticulous web UI and click on the **${SIMULATION_TAB_NAMES.TIMELINE_AND_LOGS}** tab. From here you can zoom in using the scroll wheel and
  pan by dragging. You'll be able to see each screenshot taken, each click, each console log recorded, and each network request made. Failures
  are highlighted in red.

  Alternatively, simulating a session locally via the **${SIMULATION_TAB_NAMES.DEBUG_LOCALLY}** tab with the flags \`--debugger --devTools\`
  will let you step through the simulation one user event at a time and pinpoint exactly where the issue is occurring.
  `;
