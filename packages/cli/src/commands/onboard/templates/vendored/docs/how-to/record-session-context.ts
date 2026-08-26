import {
  TESTING_FEATURE_FLAGS,
  TYPESCRIPT_TYPES_URL,
} from "src/lib/utils/internal-urls/docs-urls.utils";
import { WHERE_CAN_I_REACH_OUT_FOR_SUPPORT } from "../constants";

export const document = `---
{
  "title": "Recording the context of a user session"
}
---

# {% $frontmatter.title %}

When recording user sessions with Meticulous, you can add contextual information. This can
make sessions easier to find, help your developers debug diffs in these sessions more
easily, and let Meticulous optimise session selection across different combinations of
context (e.g. flags, roles, themes).

All \`window.Meticulous?.context.*\` calls below use optional chaining, so they're safe
no-ops when the recorder isn't loaded — there's no need to guard them or check
\`isRunningAsTest\`.

If your project uses TypeScript, install
[\`@alwaysmeticulous/sdk-bundles-api\`](${TYPESCRIPT_TYPES_URL}) and augment the \`Window\`
interface as shown in the [TypeScript Types page](${TYPESCRIPT_TYPES_URL}); that gives
every call below full type safety. You only need to do this once per project — the same
augmentation covers \`recordUserId\`, \`recordUserEmail\`, \`recordFeatureFlag\`,
\`recordCustomContext\`, and the rest of \`window.Meticulous\`.

## Adding context to user sessions

Meticulous provides several methods to record different types of context. If you record
the same piece of context multiple times, the last value will be used.

### Recording user information

You can record the ID and email address of the logged-in user:

\`\`\`js
// Record the ID of the logged-in user
window.Meticulous?.context.recordUserId('user-123');

// Record the email address of the logged-in user
window.Meticulous?.context.recordUserEmail('user@example.com');
\`\`\`

This information is associated with the session and makes it easier to find sessions for
specific users.

A natural place for these calls is wherever you load the current user (e.g. a
\`useCurrentUser\` / \`useSession\` hook, or a \`/me\` query). If your app has a separate
post-login flow where the user starts logged out and then signs in, you may also want to
record there so those sessions pick up the user identity too.

### Recording feature flags

You can record which feature flags were active during a session (the value should be a
string or boolean):

\`\`\`js
window.Meticulous?.context.recordFeatureFlag('bigUiRefactor', true);
window.Meticulous?.context.recordFeatureFlag('checkoutFlowStyle', 'v3');
\`\`\`

We recommend looping over the flags your app already evaluates rather than maintaining a
hand-curated list — that way new flags are picked up automatically:

\`\`\`js
// Use whichever flag map your app already has — an SDK snapshot
// (e.g. client.getAllFlags() / posthog.getAllFlags()), an API
// response from your backend, or a shared flag-provider value.
const flags = client.getAllFlags();
for (const [name, value] of Object.entries(flags)) {
  window.Meticulous?.context.recordFeatureFlag(name, value);
}
\`\`\`

If your app uses **both** a client-side SDK *and* server-evaluated flags (whose resolved
values reach the frontend via something like a \`features\` field on \`/me\`), it's worth
looping over both — they each affect what the UI renders. Recording the same flag twice
is fine; the last value wins.

A reasonable place to call this is wherever flags first become available (the SDK's
initial-fetch callback, or the effect that resolves your flags API response). If your app
re-evaluates flags after login or identity changes, recording there as well keeps the
context accurate for sessions that started logged out.

To learn how Meticulous *tests* the flags you record, see
[Testing Feature Flags with Meticulous](${TESTING_FEATURE_FLAGS}).

### Recording custom context

For any other contextual information that doesn't fit into the categories above, you can
use the custom context method (again with a string or boolean value):

\`\`\`js
window.Meticulous?.context.recordCustomContext('userRole', 'admin');
\`\`\`

Anything that changes how the UI looks or behaves between sessions is worth considering,
since recording it helps Meticulous tell those differences apart from real diffs. Common
examples:

- **User role / permissions** — admin vs regular user, role-gated menus and actions.
  Often available on the same user object you read for \`recordUserId\`.
- **Tenant / organization / workspace ID** — for multi-tenant apps, which tenant is
  active.
- **Theme / colour scheme** — whatever drives the \`dark\` class on \`<html>\` or your
  theme provider.
- **Locale / language** — i18n setting from cookies, localStorage, \`useLocale\`,
  \`next-intl\`, \`i18next\`, etc.
- **Viewport / layout mode** — compact vs comfortable, sidebar collapsed, etc., when
  saved per-user.
- **Plan / subscription tier** — free vs pro vs enterprise, when it changes the UI.
- **Environment or build version** — useful when comparing diffs across deploys.
- **A/B test assignments** outside your main flag provider.

It's usually enough to record each value once, where it's first read or initialised. If
the value can change mid-session (a theme toggle, a locale switcher, a tenant switcher),
recording in the change handler too keeps the context accurate.

## Related Pages

- [Testing Feature Flags with Meticulous](${TESTING_FEATURE_FLAGS}) - Learn how Meticulous tests the feature flags you record
- [TypeScript Types for window.Meticulous](${TYPESCRIPT_TYPES_URL}) - Get type definitions for the \`window.Meticulous\` object

${WHERE_CAN_I_REACH_OUT_FOR_SUPPORT}
`;
