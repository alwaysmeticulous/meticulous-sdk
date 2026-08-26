import { METICULOUS_BACKEND_SETUP_CALENDLY_LINK } from "src/lib/next/next.constants";
import {
  ADDITIONAL_GUIDES,
  NEXTJS_APP_ROUTER_ADDITIONAL_SETUP_URL,
} from "src/lib/utils/internal-urls/docs-urls.utils";

const BACKEND_RECORDER_PACKAGE = "@alwaysmeticulous/backend-recorder-launcher";
const WORKERD_RECORDER_PACKAGE = "@alwaysmeticulous/backend-recorder-workerd";

const BOOK_A_CALL_TIP = `If you have any issues setting up the backend recorder then click [here](${METICULOUS_BACKEND_SETUP_CALENDLY_LINK}) to book a call with us.`;

export const document = `---
{
  "title": "Install the backend recorder"
}
---

# {% $frontmatter.title %}

The backend recorder captures the server side of your users' sessions. It intercepts HTTP requests and responses in your Node.js
app using OpenTelemetry approach and exports them to Meticulous, where they are used to stub out backend calls during replays. This means
Meticulous can replay sessions accurately even when they depend on data returned by your own API.

The backend recorder is installed via the [\`${BACKEND_RECORDER_PACKAGE}\`](https://www.npmjs.com/package/${BACKEND_RECORDER_PACKAGE})
package from the Meticulous SDK. It is complementary to the [frontend recorder](${ADDITIONAL_GUIDES.INSTALL_RECORDER_SCRIPT_FOR_BACKEND_TESTING_URL})
— install the frontend recorder to capture user activity in the browser, and the backend recorder to capture the matching server-side requests.

{% callout_card variant="info" title="When do I need the backend recorder?" %}
The backend recorder is only required when your app uses **server-side rendering (SSR)**. In SSR apps, data is fetched on the server
before the page reaches the browser, so the frontend recorder never sees those requests — the backend recorder captures them instead
so Meticulous can stub them during replay. If your app renders entirely on the client (e.g. a standard SPA), the frontend recorder
already captures every request and the backend recorder is not needed. ${BOOK_A_CALL_TIP}
{% /callout_card %}

## 1. Install the package

\`\`\`bash
npm install ${BACKEND_RECORDER_PACKAGE}
\`\`\`

The recorder must be loaded **before** your application code so it can patch Node.js' HTTP modules before any requests are made.
Pick the option below that matches your setup.

## 2. Initialize the recorder

{% tabs direction="grid" noTabSelectedByDefault=true %}
{% tab label="Next.js" %}
## Next.js

Next.js loads the file named \`instrumentation.ts\` (or \`instrumentation.js\`) at the root of your project before the rest of your app
boots. Initialize the recorder from its \`register\` hook, guarding on the Node.js runtime so it never runs in the Edge runtime or the browser:

{% code_with_project_selector %}
\`\`\`ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initBackendRecorder } = await import(
      "${BACKEND_RECORDER_PACKAGE}"
    );
    await initBackendRecorder({
      meticulousProjectName: "{% project_name /%}",
      recordingToken: "{% project_recording_token /%}",
    });
  }
}
\`\`\`
{% /code_with_project_selector %}

Mark the package as an external package so Next.js does not try to bundle it. In \`next.config.js\`:

\`\`\`js
// next.config.js
module.exports = {
  serverExternalPackages: ["${BACKEND_RECORDER_PACKAGE}"],
};
\`\`\`

If you are using the App Router, also follow the [additional App Router setup](${NEXTJS_APP_ROUTER_ADDITIONAL_SETUP_URL}) to ensure
Meticulous can correctly test your app.

${BOOK_A_CALL_TIP}
{% /tab %}

{% tab label="TanStack Start" %}
## TanStack Start

TanStack Start's server entry point (\`src/server.ts\` by default) is the first server module that runs, so it's the right place
to load the recorder. Create a separate \`src/instrumentation.ts\` file that initializes it, then import that file as the very
first import in \`src/server.ts\` — ahead of the \`@tanstack/react-start/server-entry\` import — so the recorder patches Node's
HTTP modules before any request-handling code runs:

{% code_with_project_selector %}
\`\`\`ts
// src/instrumentation.ts
import { initBackendRecorder } from "${BACKEND_RECORDER_PACKAGE}";

await initBackendRecorder({
  meticulousProjectName: "{% project_name /%}",
  recordingToken: "{% project_recording_token /%}",
});
\`\`\`
{% /code_with_project_selector %}

\`\`\`ts
// src/server.ts
import "./instrumentation";

import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request);
  },
});
\`\`\`

If your build ends up bundling \`${BACKEND_RECORDER_PACKAGE}\` into the server output, mark it as external in your Vite/Nitro
server config so it keeps patching the real Node.js \`http\`/\`https\` modules rather than a bundled copy. ${BOOK_A_CALL_TIP}
{% /tab %}

{% tab label="Node.js (instrumentation file)" %}
## Node.js

Create an \`instrumentation.js\` file at the root of your project that initializes the recorder:

{% code_with_project_selector %}
\`\`\`js
// instrumentation.js
const { initBackendRecorder } = require("${BACKEND_RECORDER_PACKAGE}");

initBackendRecorder({
  meticulousProjectName: "{% project_name /%}",
  recordingToken: "{% project_recording_token /%}",
});
\`\`\`
{% /code_with_project_selector %}

Start your app with the \`--require\` flag so the recorder is loaded before your application code:

\`\`\`bash
node --require ./instrumentation.js app.js
\`\`\`

${BOOK_A_CALL_TIP}
{% /tab %}

{% tab label="Cloudflare Workers" %}
## Cloudflare Workers

Workers run on the workerd runtime rather than Node.js, so the Node backend recorder above cannot be loaded in-process
(skip step 1 — the \`${BACKEND_RECORDER_PACKAGE}\` package is not used here). Instead, Meticulous records during local
development (\`wrangler dev\`) with a two-part setup:

- A lightweight **shim** (\`${WORKERD_RECORDER_PACKAGE}\`) wraps your Worker's fetch handler and captures inbound requests
  plus outgoing \`fetch\` calls. Outgoing requests still go directly to their destination — the recorder is never in the
  request path — and when no sidecar is configured the shim is a complete no-op, so it is safe to keep in deployed code.
- The **Meticulous recorder sidecar**, a small Node process on your dev machine started by the Meticulous CLI, receives
  those events and uploads them to Meticulous as backend recordings.

Install the shim and wrap your Worker's handler:

\`\`\`bash
npm install ${WORKERD_RECORDER_PACKAGE}
\`\`\`

\`\`\`ts
import { withMeticulous } from "${WORKERD_RECORDER_PACKAGE}";

export default withMeticulous({
  async fetch(request, env, ctx) {
    // your app
  },
});
\`\`\`

Enable the \`nodejs_als\` compatibility flag in your \`wrangler.toml\` (if you already use \`nodejs_compat\` — e.g. for
TanStack Start — you're done, it includes it):

\`\`\`toml
compatibility_flags = ["nodejs_als"]
\`\`\`

Then run your dev command through the Meticulous CLI, which starts the sidecar and passes its URL to \`wrangler dev\`
automatically:

\`\`\`bash
npx @alwaysmeticulous/cli record backend -- npx wrangler dev
\`\`\`

Authenticate with \`npx @alwaysmeticulous/cli auth login\` first (or pass \`--apiToken\`). If you prefer to run
\`wrangler dev\` yourself, \`npx @alwaysmeticulous/cli record backend\` (without a wrapped command) starts just the
sidecar and prints the \`--var METICULOUS_SIDECAR_URL:...\` / \`.dev.vars\` line to point your Worker at it — the value
must be a worker var, since host environment variables are not visible inside workerd.

\`fetch\` egress is captured (including \`node:http\`/\`node:https\` clients under \`nodejs_compat\`, which are implemented
over fetch), as are calls through \`fetch\`-shaped bindings — service bindings and Durable Object stubs — with no code
change beyond the \`withMeticulous\` wrapper. Assets bindings are skipped by default, since asset traffic is high-volume
and adds nothing to a replay. KV, D1, R2, Queues, RPC method calls on a named entrypoint (\`env.SVC.someMethod()\`), and
WebSockets are not yet supported.
${BOOK_A_CALL_TIP}
{% /tab %}

{% /tabs %}

## 3. Configuration options

\`initBackendRecorder\` accepts an optional config object:

| Option | Type | Description |
|---|---|---|
| \`enabled\` | \`boolean\` | Enable or disable the recorder. Defaults to \`true\`. |
| \`meticulousProjectName\` | \`string\` | The name of your Meticulous project. |
| \`recordingToken\` | \`string\` | Token used to authenticate span uploads. This is the same recording token used by the frontend recorder snippet. |
| \`exportMode\` | \`"local" \\| "s3"\` | Where to export recorded spans. Defaults to \`"s3"\`, which uploads to Meticulous. Use \`"local"\` to write sessions to disk for debugging. |
| \`localOutputDir\` | \`string\` | Directory for local exports. Only used when \`exportMode\` is \`"local"\`. |
| \`flushIntervalMs\` | \`number\` | How often to flush spans, in milliseconds. |
| \`spanRedactionHooks\` | \`((value: string) => string)[]\` | Ordered record-time hooks that transform redactable span strings before they are uploaded. Node.js only. |

A common pattern is to record only in the environments you care about:

{% code_with_project_selector %}
\`\`\`ts
await initBackendRecorder({
  enabled: process.env.NODE_ENV !== "production",
  meticulousProjectName: "{% project_name /%}",
  recordingToken: "{% project_recording_token /%}",
});
\`\`\`
{% /code_with_project_selector %}

### Redacting recorded backend data

Use \`spanRedactionHooks\` to replace sensitive values before completed spans are saved or uploaded. Each hook receives every
redactable string and must return a string. Hooks run in the order they are provided:

{% code_with_project_selector %}
\`\`\`ts
await initBackendRecorder({
  meticulousProjectName: "{% project_name /%}",
  recordingToken: "{% project_recording_token /%}",
  spanRedactionHooks: [
    (value) =>
      value.replace(
        /api_key=[A-Za-z0-9_-]+/g,
        "api_key=[REDACTED_API_KEY]",
      ),
  ],
});
\`\`\`
{% /code_with_project_selector %}

The hooks cover span names, error/status messages, and all span attribute values, including strings inside arrays or objects and JSON
captured inside strings. They do not transform attribute names, trace/span/parent IDs, timestamps, span kind, client-technology routing,
or frontend session IDs.

Hooks run only while recording. If a hook throws or returns a non-string, Meticulous abandons the recording rather than saving the span
without redaction. Replacing backend-generated request data can also change a replay match key; use stable replacements and verify that
the corresponding input will have the same value during replay. This programmatic option applies to the Node.js recorder and is not
available to the Cloudflare Workers sidecar.

## 4. Flush spans on shutdown

\`initBackendRecorder\` returns a handle with a \`stopRecording()\` method. Call it before your process exits so any pending spans are
flushed and uploaded:

\`\`\`ts
const handle = await initBackendRecorder({
  /* ...config... */
});

process.on("SIGTERM", async () => {
  await handle?.stopRecording();
  process.exit(0);
});
\`\`\`

## 5. Recording anything else

The recorder instruments the common clients automatically — \`fetch\`, \`http\`, Postgres, Prisma, Redis. For anything else, wrap the call
yourself:

\`\`\`ts
const user = await handle.withMeticulousOperation(
  { name: "crm.getUser", key: { id } },
  () => crm.getUser(id),
);
\`\`\`

While recording, Meticulous runs your function and captures what it returned. During a replay it does **not** run it — it returns the
recorded result (or throws the recorded error) in its place. That is why the wrapper has to make the call rather than be told about it
afterwards.

There are two good reasons to reach for this.

The first is a client we don't instrument — a gRPC stub, a vendor SDK with its own transport.

The second is more interesting, and applies even to calls we *do* instrument: **an operation that sits above the network**. Take a
function that checks an in-process cache and only calls an API on a miss. If the cache was warm while recording there was no request to
record, so nothing is captured and the replay has nothing to serve. Wrap the function instead and the recording holds the operation
itself — so it replays whether or not the cache happened to be warm, and cache hits stop making replays inconsistent.

\`\`\`ts
const getUser = (id: string) =>
  handle.withMeticulousOperation({ name: "users.get", key: { id } }, async () => {
    const cached = cache.get(id);
    if (cached) return cached;
    const user = await api.fetchUser(id);
    cache.set(id, user);
    return user;
  });
\`\`\`

A few things to know:

- **\`name\` identifies the operation, so renaming it invalidates existing recordings.** A test run compares against a base recorded days
  or weeks earlier, so after a rename every call to that operation has nothing to match and the request fails. Rename deliberately.
- **\`key\` is what distinguishes one call from another** — usually the arguments. Leave out values that change on every call but don't
  affect the result, such as a request id or a nonce; including them means no call ever matches its recording. Timestamps and UUIDs are
  handled for you, and if a key still doesn't match, Meticulous falls back to a recording of the same operation.
- **Arguments and results are stored as JSON**, so a \`Date\` comes back as a string and a \`Map\` as \`{}\`. Meticulous logs a warning naming
  the exact field when it sees one while recording. Thrown errors are captured and re-thrown with their \`name\`, \`message\` and custom
  properties intact, though \`instanceof\` checks against your own error class won't match.
- **Synchronous functions stay synchronous** on both paths.
- **A call with no recording fails the request** rather than quietly running for real — a replay that reaches live services isn't
  reproducible.

To record app state that no call produces — resolved feature flags, a chosen experiment arm — use:

\`\`\`ts
handle.recordMeticulousObservation("featureFlags.resolved", flags);
\`\`\`

This only records: it never stubs anything, never throws, and is ignored during replay.

### If you'd rather not hand us the call

Some teams don't want their own code running inside our callback. The same capture is available as two calls you make yourself, with the
branch in your code:

\`\`\`ts
function getUser(id: string) {
  if (handle.isMeticulousReplaying()) {
    return handle.stubWithMeticulous<User>(\`user_\${id}\`);
  }

  const user = crm.getUser(id);
  handle.recordWithMeticulous(\`user_\${id}\`, user);

  return user;
}
\`\`\`

\`recordWithMeticulous\` takes the value the operation produced. A promise is fine, and is the usual case: its resolved value is recorded, the
promise you return is untouched, and \`stubWithMeticulous\` then returns a promise to match. These are the same recordings
\`withMeticulousOperation\` produces, so you can move between the two forms without invalidating anything. Here the name is the whole
identity — there is no separate \`key\`, so put whatever distinguishes one call from another into the name.

Use \`isMeticulousReplaying()\` for the branch rather than checking an env var yourself. The mode a process was started in, and an image
built for Meticulous, are both the same in either mode, so neither tells you whether a recorded outcome can actually be served.

Two things you give up by splitting it, which is why wrapping is still the better default where it's acceptable:

- **A thrown error isn't captured.** \`recordWithMeticulous\` is handed a value, so a call that threw never reaches it and the replay has
  nothing to serve. A rejected promise *is* captured. If failure is part of the flow, wrap instead.
- **The branch is yours to get right**, and only the replay side of it is exercised by a replay — so a mistake in the other side won't
  show up until it reaches production.

That's it — once your app is running with the backend recorder enabled, server-side requests will be captured alongside the frontend
sessions and used to stub backend calls during replay.
`;
