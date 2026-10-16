import {
  FLAG_OVERRIDE_TROUBLESHOOTING_ANCHOR,
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

## How replays handle feature flags

When a session is recorded, Meticulous snapshots its network responses, local storage, cookies and session storage, and
[stubs out and replays those values](${NETWORK_STUBBING_EXPLANATION_URL}) when it later replays the session. So each replay
keeps the flag values its session was recorded with.

That already tests your flags in more than one state. If two sessions executed different code because a flag was on in
one and off in the other, Meticulous's [coverage-based test suite](${TESTING_POOL_URL}) will often keep both. For example,
if user 1 records session A with *my_new_feature* off and user 2 records session B with it on, session A replays with
the feature disabled and session B replays with it enabled.

Two gaps remain, and the rest of this page covers them:

- A flag that was off in every recorded session never gets tested on. [Letting Meticulous override named
  flags](#letting-meticulous-override-named-feature-flags) closes this gap for the flags a pull request touches.
- Sessions recorded before a flag existed have no value for it. [Defaulting new flags to on](#defaulting-new-flags-to-on)
  closes this gap.

## Letting Meticulous Override Named Feature Flags {% #letting-meticulous-override-named-feature-flags %}

Meticulous can force a *named* feature flag to a specific value during a replay, so a replay can exercise code behind a
flag that was off — or did not exist — when the session was recorded.

{% flag_override_diagram /%}

How it works:

1. **Recording doesn't change.** Real users get your normal flag values, and your app reports them with
   \`recordFeatureFlag\`. These reports are how Meticulous learns which flags exist and which values they take.
2. **Meticulous picks flags to force.** On a pull request, it looks at which flags the change touches and adds replays
   with those flags set to the values the change is about, alongside your normal replays.
3. **Your app applies the forced value.** During those replays your app uses the forced value in place of its normal
   evaluation, and keeps reporting the value it actually used with \`recordFeatureFlag\`. Real users being recorded never
   receive a forced value.

Your app receives forced values through the [JavaScript API](#using-the-javascript-api). Meticulous starts forcing flags
for your project once it sees your app call \`getFlagOverride\` during a replay.

### Using the JavaScript API {% #using-the-javascript-api %}

Wrap the helper your app uses to read a flag. Resolve the value once: prefer \`getFlagOverride\`, otherwise use your own
evaluation, then **record that same value** with \`recordFeatureFlag\` before returning it. \`getFlagOverride\` asks
Meticulous which value to use, and \`recordFeatureFlag\` tells Meticulous which value your app actually used. Recording a
snapshot from \`getAllFlags()\` (or similar) will miss a forced value, because the SDK never saw the override.

\`\`\`typescript
const resolveFlag = (flagKey: string) => {
  const override = window.Meticulous?.context?.getFlagOverride?.(flagKey);
  const value = override?.overridden
    ? Boolean(override.value)
    : flagsFromYourApp[flagKey] || false;
  window.Meticulous?.context?.recordFeatureFlag?.(flagKey, value);
  return value;
}
\`\`\`

Hook the helper your application actually calls. \`getFlagOverride\` returns \`{ overridden: false }\` whenever Meticulous
has no override for that flag, and always does so for real users being recorded, so it is safe to leave in production
code. Use optional chaining as shown so your application also works when the Meticulous snippet isn't loaded. For
complete wrappers for specific SDKs, see [Feature flag providers](#feature-flag-providers).

### Matching the override to your helper

How you consume \`override.value\` depends on the helper you wrap — \`Boolean()\` is not always right. Always record the
flag's resolved value (the thing that describes the cohort), not a comparison boolean:

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

If you wrap the value-read underneath an equality-check (\`getExperimentValue\` under \`editorExperiment\`), use the
value-read rule and record there — the \`===\` already happens above you.

### Reading every override at once

If your app resolves all of its flags in one place — a flag map built at startup, or a client initialised with a full
set of values (such as LaunchDarkly's \`bootstrap\` option) — use \`getAllFlagOverrides\` instead of asking about each
flag in turn. It returns every flag the current replay forces, keyed by flag name, so you can layer the overrides on top
of your own values:

\`\`\`typescript
const flags = {
  ...flagsFromYourBackend,
  ...window.Meticulous?.context?.getAllFlagOverrides?.(),
};
for (const [name, value] of Object.entries(flags)) {
  window.Meticulous?.context?.recordFeatureFlag?.(name, value);
}
\`\`\`

The same consumption rules apply: an override for an on/off gate may be a string, so coerce it where your app expects a
boolean. Flags missing from the returned object are not overridden. It returns \`{}\` for real users being recorded, so
it is safe to leave in production code.

## Defaulting new flags to on {% #defaulting-new-flags-to-on %}

Sessions recorded *before* a flag was introduced replay old network responses and local storage values that have no
entry for it, so they usually won't test the new feature until new sessions are recorded with the flag on.

You can close that gap without waiting: when your app is running as part of a Meticulous test (checked with
[window.Meticulous?.isRunningAsTest](${METICULOUS_WINDOW_OBJECT_URL})) and a flag has no configuration at all, default it to
on. Check for a named override first, then apply this default, then record the value you return. **We recommend this if
you often develop new features behind feature flags.** The provider sections below show how.

## Feature flag providers {% #feature-flag-providers %}

Each wrapper below combines a named override, the default-on fallback for unrecognised flags, and recording. Wrap your
client once and use the wrapper everywhere, rather than updating every call site.

### Statsig {% #statsig %}

Wrap \`checkGate\`. Statsig reports an \`Unrecognized\` reason for a gate it has no configuration for, which is the
signal to default it to on during a Meticulous test. The same approach works for Statsig's React integration.

\`\`\`typescript
import { StatsigClient } from '@statsig/js-client';

const myStatsigClient = new StatsigClient(
  YOUR_CLIENT_KEY,
  { userID: 'a-user' },
  ...
);
await myStatsigClient.initializeAsync();

// Use this wrapper in place of myStatsigClient.checkGate
const checkGate = (gateName: string) => {
  const override = window.Meticulous?.context?.getFlagOverride?.(gateName);
  if (override?.overridden) {
    const value = Boolean(override.value);
    window.Meticulous?.context?.recordFeatureFlag?.(gateName, value);
    return value;
  }

  // During a Meticulous test, default gates with no configuration to on, so that old sessions
  // can test new features. See https://docs.statsig.com/sdk/debugging
  const value =
    window.Meticulous?.isRunningAsTest
      && myStatsigClient.getFeatureGate(gateName).details.reason.endsWith("Unrecognized")
      ? true
      : myStatsigClient.checkGate(gateName);
  window.Meticulous?.context?.recordFeatureFlag?.(gateName, value);
  return value;
}
\`\`\`

### LaunchDarkly {% #launchdarkly %}

Wrap \`variation\`. Check for a named override first, and during a Meticulous test pass \`true\` as the default so a
flag with no configuration resolves to on:

\`\`\`typescript
const variation = (flagKey: string, defaultValue: boolean) => {
  const override = window.Meticulous?.context?.getFlagOverride?.(flagKey);
  const value = override?.overridden
    ? override.value
    : client.variation(
        flagKey,
        window.Meticulous?.isRunningAsTest ? true : defaultValue,
      );
  window.Meticulous?.context?.recordFeatureFlag?.(flagKey, value);
  return value;
}
\`\`\`

If you initialise LaunchDarkly with a full set of values through its \`bootstrap\` option, use
[\`getAllFlagOverrides\`](#reading-every-override-at-once) to layer the overrides on top of them instead.

### Other providers and your own flags

The same three steps work for any flag system, including one you've written yourself: check \`getFlagOverride\`, fall
back to your own evaluation (defaulting unconfigured flags to on during a Meticulous test if you want), and record the
value you return. See [Using the JavaScript API](#using-the-javascript-api).

## Troubleshooting {% #${FLAG_OVERRIDE_TROUBLESHOOTING_ANCHOR} %}

**No forced replays appear on pull requests that change a flag.** Meticulous only forces flags once it has seen your app
call \`getFlagOverride\` during a replay, and only for flags your app reports with \`recordFeatureFlag\`. Check that the
helper your code uses calls both.

**A forced flag didn't change what the replay rendered.**

- **The flag is read through a path that never asks for an override.** Make sure every path your components read flags
  through either checks \`getFlagOverride\` or was built with \`getAllFlagOverrides\`. A flag map built from your
  provider alone (such as \`getAllFlags()\`), or a value restored from local storage, won't include the override.
- **The value doesn't match your helper's shape.** A boolean override on a helper that returns a variant name, or a
  \`Boolean()\` wrapped around a variant, quietly picks the wrong branch. See
  [Matching the override to your helper](#matching-the-override-to-your-helper).
- **The flag is evaluated only on your server.** The JavaScript API runs in the browser, so a flag your server resolves
  while rendering a page doesn't see it.
- **The code behind the flag has no visible effect in that session.** A forced flag can only change screenshots on pages
  the recorded session actually visits.

**Meticulous shows a forced replay but no flag value next to it.** Meticulous shows the values your app reports with
\`recordFeatureFlag\`. Record the value your helper returns, including when it came from an override.

## Related Pages

- [Recording the context of a user session](${RECORD_SESSION_CONTEXT_URL}) - Learn how to record feature flags and other session context
- [TypeScript Types for window.Meticulous](${TYPESCRIPT_TYPES_URL}) - Get type definitions for the \`window.Meticulous\` object
`;
