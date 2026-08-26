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

And since different feature flag combinations activate different code paths, and Meticulous
[optimizes the test suite to cover all code paths](${TESTING_POOL_URL}), Meticulous will normally automatically include
test cases for all relevant recorded feature flag combinations.

For example, say user 1 records a first user session, session A, and user 2 records a second user session, session B, and the value of the feature
flag *my_new_feature* is false for user 1 and true for user 2, then when Meticulous replays session A it'll replay with *my_new_feature* disabled,
and when Meticulous replays session B it'll replay with *my_new_feature* enabled. Meticulous will likely select both sessions into the test
suite since they cover different code paths.

### Improving Test Coverage with New Feature Flags

As mentioned above Meticulous will automatically test feature flag combinations if sessions are recorded with the different feature flags enabled.
However any sessions recorded *prior* to the feature flag being introduced will likely not test the new feature since they'll replay old saved
network responses and local storage values without an entry for the new feature flag. This means test coverage of new features gated
behind feature flags can be limited until new sessions are recorded with that feature flag enabled.

You can fix this by enabling the feature flags by default when running as part of a Meticulous test in the case that the feature flag cannot be found in
the network response or local storage (i.e. when Meticulous is replaying old network responses or local storage values from before the
feature flag was introduced). We've included instructions for Statsig below, but a similar approach can be applied for any feature flagging
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
  // If the application is running as part of a Meticulous test, and Meticulous is replaying old network responses or local storage values
  // from before the feature gate was introduced then let's default the feature to on, so that Meticulous can use old user sessions to test
  // new features.
  //
  // See https://docs.statsig.com/sdk/debugging
  if (window.Meticulous?.isRunningAsTest
      && myStatsigClient.getFeatureGate(gateName).details.reason.endsWith("Unrecognized")) {
    return true;
  }
  return myStatsigClient.checkGate(gateName);
}
\`\`\`

### Configuring Meticulous with LaunchDarkly

When accessing a variation default it to true if [window.Meticulous?.isRunningAsTest](${METICULOUS_WINDOW_OBJECT_URL}) is true.

Before:
\`\`\`typescript
client.variation('my_new_feature', false);
\`\`\`

After:

\`\`\`typescript
client.variation('my_new_feature', window.Meticulous?.isRunningAsTest ?? false);
\`\`\`

We recommend wrapping your client to make this the automatic behavior rather than updating every call site.

## Related Pages

- [Recording the context of a user session](${RECORD_SESSION_CONTEXT_URL}) - Learn how to record feature flags and other session context
- [TypeScript Types for window.Meticulous](${TYPESCRIPT_TYPES_URL}) - Get type definitions for the \`window.Meticulous\` object
`;
