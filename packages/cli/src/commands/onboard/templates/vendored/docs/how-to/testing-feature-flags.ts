import {
  METICULOUS_WINDOW_OBJECT_URL,
  NETWORK_STUBBING_EXPLANATION_URL,
  RECORD_SESSION_CONTEXT_URL,
  TESTING_POOL_URL,
  TYPESCRIPT_TYPES_URL,
} from "src/lib/utils/internal-urls/docs-urls.utils";

export const document = `---
{
  "title": "Testing Feature Flags with Meticulous"
}
---

# {% $frontmatter.title %}

> **Note:** To learn how to *register* feature flags in your sessions, see [Recording the context of a user session](${RECORD_SESSION_CONTEXT_URL}). This page explains how Meticulous *tests* feature flags.

By default Meticulous will snapshot the network responses, local storage values, cookies and session storage values when a session is
originally recorded, and [stub out and replay those values](${NETWORK_STUBBING_EXPLANATION_URL}) when later replaying the session. This allows
Meticulous to test across varied feature flag configurations.

If two recorded sessions executed different code because a flag was on in one and off in the other, Meticulous's
[coverage-based test suite](${TESTING_POOL_URL}) will often keep both. Replays stub the recorded network and storage, so those sessions keep
the flag values they were recorded with. Meticulous does not enumerate flag combinations as its own selection signal.

For example, say user 1 records session A with *my_new_feature* off, and user 2 records session B with *my_new_feature* on. When Meticulous
replays session A it will replay with *my_new_feature* disabled, and when it replays session B it will replay with *my_new_feature* enabled.
If those sessions cover different code paths, both are likely to stay in the suite.

### Letting Meticulous Override Named Feature Flags

Meticulous can ask your application to use a specific value for a *named* feature flag during a replay,
so that a replay can exercise code behind a flag that was off — or did not exist — when the session was
recorded.

To opt in, resolve the value once: prefer \`getFlagOverride\`, otherwise use your own evaluation, then
**record that same value** with \`recordFeatureFlag\` before returning it. The two APIs are complementary
— \`getFlagOverride\` asks Meticulous which value to use, and \`recordFeatureFlag\` tells Meticulous which
value your app actually used. Recording a snapshot from \`getAllFlags()\` (or similar) will miss a forced
value, because the SDK never saw the override.

\`\`\`typescript
const checkGate = (gateName: string) => {
  const override = window.Meticulous?.context?.getFlagOverride?.(gateName);
  const value = override?.overridden
    ? Boolean(override.value)
    : myStatsigClient.checkGate(gateName);
  window.Meticulous?.context?.recordFeatureFlag?.(gateName, value);
  return value;
}
\`\`\`

The same few lines work for any on/off gate, including one you've written yourself. For example,
if your app resolves flags from the query string:

\`\`\`typescript
const resolveFlag = (flagKey: string) => {
  const override = window.Meticulous?.context?.getFlagOverride?.(flagKey);
  const value = override?.overridden
    ? Boolean(override.value)
    : flagsFromQueryString[flagKey] || false;
  window.Meticulous?.context?.recordFeatureFlag?.(flagKey, value);
  return value;
}
\`\`\`

How you consume \`override.value\` depends on the helper you wrap — \`Boolean()\` is not always right.
Always record the flag's resolved value (the thing that describes the cohort), not a comparison boolean:

- **On/off gate** (\`checkGate(name)\` returns a boolean): \`Boolean(override.value)\`, as above. Record that boolean.
- **Value-read** (\`getExperimentValue(name)\` / \`variation(name)\` returns the cohort): return and record \`override.value\` as-is. \`Boolean('control')\` is \`true\`, which would turn every variant on.
- **Equality-check** (\`isTreatment(name, expected)\` / \`editorExperiment(name, expected)\` returns a boolean meaning "is this flag set to \`expected\`"): compare, don't coerce. Record \`override.value\`, not the \`===\` result. Wrapping with \`Boolean(override.value)\` makes every \`expected\` match; returning the string is equally wrong because callers expect a boolean:

\`\`\`typescript
const isTreatment = (name: string, expected: string | boolean) => {
  const override = window.Meticulous?.context?.getFlagOverride?.(name);
  if (override?.overridden) {
    window.Meticulous?.context?.recordFeatureFlag?.(name, override.value);
    return override.value === expected;
  }
  return originalIsTreatment(name, expected);
}
\`\`\`

If you wrap the value-read underneath an equality-check (\`getExperimentValue\` under \`editorExperiment\`),
use the value-read rule and record there — the \`===\` already happens above you.

Hook the helper your application actually calls. \`getFlagOverride\` returns \`{ overridden: false }\` whenever
Meticulous has no override for that flag, and always does so for real users being recorded, so it is safe
to leave in production code. Use optional chaining as shown above so your application also works when the
Meticulous snippet isn't loaded.

It also composes with the blanket default described below: check for an override first, then fall back to
defaulting unrecognised flags to enabled, then record the value you return.

### Improving Test Coverage with New Feature Flags

As mentioned above, sessions recorded with different flag values will keep those values on replay, and
coverage-based selection will often keep both. Sessions recorded *prior* to a feature flag being introduced
will likely not test the new feature, because they replay old saved network responses and local storage
values without an entry for it. Test coverage of new features gated behind flags can therefore stay limited
until new sessions are recorded with that flag enabled — unless you opt into \`getFlagOverride\` above, or
the default-enabled fallback below.

You can enable unrecognised flags by default when running as part of a Meticulous test (i.e. when Meticulous
is replaying old network responses or local storage values from before the flag was introduced). We've
included instructions for Statsig below, but a similar approach can be applied for any feature flagging
framework. **We recommend making this change if you often develop new features gated behind feature flags.**

### Configuring Meticulous with Statsig

Before checking a feature flag value first check [window.Meticulous?.isRunningAsTest](${METICULOUS_WINDOW_OBJECT_URL}), and if so then
check if configuration for the feature flag is missing entirely - if it is then default the feature flag to enabled. This then allows
Meticulous to use old sessions to test new features. Here's an example for Statsig, however similar approaches can be followed for other
feature flagging frameworks, and for Statsig's React integration:

\`\`\`typescript
import { StatsigClient } from '@statsig/js-client';

const myStatsigClient = new StatsigClient(
  YOUR_CLIENT_KEY,
  { userID: 'a-user' },
  ...
);
await myStatsigClient.initializeAsync();

// We wrap checkGate, and use the wrapped version in our code instead of directly calling myStatsigClient.checkGate
const checkGate = (gateName: string) => {
  const override = window.Meticulous?.context?.getFlagOverride?.(gateName);
  if (override?.overridden) {
    const value = Boolean(override.value);
    window.Meticulous?.context?.recordFeatureFlag?.(gateName, value);
    return value;
  }

  // If the application is running as part of a Meticulous test, and Meticulous is replaying old network responses or local storage values
  // from before the feature gate was introduced then let's default the feature to on, so that Meticulous can use old user sessions to test
  // new features.
  //
  // See https://docs.statsig.com/sdk/debugging
  const value =
    window.Meticulous?.isRunningAsTest
      && myStatsigClient.getFeatureGate(gateName).details.reason.endsWith("Unrecognized")
      ? true
      : myStatsigClient.checkGate(gateName);
  window.Meticulous?.context?.recordFeatureFlag?.(gateName, value);
  return value;
}
\`\`\`

### Configuring Meticulous with LaunchDarkly

When accessing a variation default it to true if [window.Meticulous?.isRunningAsTest](${METICULOUS_WINDOW_OBJECT_URL}) is true, after
checking for a named override. Record the value you return:

\`\`\`typescript
const variation = (flagKey: string, defaultValue: boolean) => {
  const override = window.Meticulous?.context?.getFlagOverride?.(flagKey);
  const value = override?.overridden
    ? override.value
    : client.variation(
        flagKey,
        window.Meticulous?.isRunningAsTest ?? defaultValue,
      );
  window.Meticulous?.context?.recordFeatureFlag?.(flagKey, value);
  return value;
}
\`\`\`

We recommend wrapping your client to make this the automatic behavior rather than updating every call site.

## Related Pages

- [Recording the context of a user session](${RECORD_SESSION_CONTEXT_URL}) - Learn how to record feature flags and other session context
- [TypeScript Types for window.Meticulous](${TYPESCRIPT_TYPES_URL}) - Get type definitions for the \`window.Meticulous\` object
`;
