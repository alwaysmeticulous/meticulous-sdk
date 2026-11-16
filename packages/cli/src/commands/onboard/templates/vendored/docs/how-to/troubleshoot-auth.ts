import { METICULOUS_SUPPORT_EMAIL } from "src/lib/next/next.constants";
import {
  AUTH_BYPASSING_AUTH_URL,
  AUTH_ENABLING_FULL_AUTH_URL,
} from "src/lib/utils/internal-urls/docs-urls.utils";

export const document = `---
{
  "title": "Troubleshoot Authentication & Authorisation Issues"
}
---

# {% $frontmatter.title %}

Auth issues are some of the most common issues that you might encounter while setting up Meticulous.
This class of issues is easily identifiable by sessions recorded on logged-in pages which, when simulated, consistently redirect to
log-in pages or 401 screens.

By default Meticulous automatically stubs all XHR, Fetch and WebSocket requests to your backend, and therefore does not necessarily need to
authenticate to your backend. In addition Meticulous will also automatically record and replay cookies,
local storage & session storage, and so will often be able to authenticate automatically.

However if you use server side rendering (SSR),
React server components, or wish to test your backend then you may need Meticulous to be able
to authenticate correctly with your backend. This works out of the box if your cookie expiries are long enough (at least a week) and
you're not using http only cookies. If this isn't the case click [here](${AUTH_ENABLING_FULL_AUTH_URL}) for docs on how to enable
Meticulous to authenticate correctly with your backend.

However even if you are only using Meticulous to test your frontend, there are still some common issues that can arise:

### 1. Backend auth checks when serving the document's HTML

When requesting your app's document/HTML your backend may check the user's authentication and redirect them to a login page if they are no
longer authenticated. If this is the case you'll either need to [disable this redirect](${AUTH_BYPASSING_AUTH_URL}) when replaying the Meticulous tests against CI/preview URLs, or allow
[Meticulous to authenticate correctly against your backend](${AUTH_ENABLING_FULL_AUTH_URL}).

### 2. Different auth setups across environments

This can be an issue if all of the following hold:

  - The environment you replay sessions against in CI and the environment you record sessions on (e.g. localhost) use different auth setups, and:
  - Your _frontend_ code checks the user's authentication status, and:
  - This check would fail if the cookies or local storage were from an environment with a different auth setup (for example, your FE code
    redirects the user to login unless a cookie with name \`auth.\${environment-name}\` exists).

In this case you'll either need to [disable the FE check when running Meticulous tests](${AUTH_BYPASSING_AUTH_URL}), or standardize your auth provider client across environments.

### 3. You are using Auth0

In this case you may need to configure Auth0 to store user session data in local storage, or not use httpOnly cookies. See [here](${AUTH_ENABLING_FULL_AUTH_URL}?tab=Auth0) for more information.

## Issues / questions?

We're always happy to help you with any issues you encounter while setting up or with anything else you might be unsure about.

Get in touch by emailing [${METICULOUS_SUPPORT_EMAIL}](mailto:${METICULOUS_SUPPORT_EMAIL}).

`;
