import { METICULOUS_SUPPORT_EMAIL } from "src/lib/next/next.constants";
import { TROUBLESHOOT_AUTH_URL } from "src/lib/utils/internal-urls/docs-urls.utils";

export const document = `---
{
  "title": "Enabling Meticulous to replay sessions fully authenticated"
}
---

# {% $frontmatter.title %}

Auth issues are some of the most common issues that you might encounter while setting up Meticulous.
This class of issues is easily identifiable by sessions recorded on logged-in pages which, when simulated, consistently redirect to
log-in pages or 401 screens.

Note that you may not need to enable full authentication if you are only using Meticulous to test your frontend (read more [here](${TROUBLESHOOT_AUTH_URL})). If you
do wish to enable full authentication, then select the auth provider that you're using from the options below:

{% tabs %}
{% tab label="Auth0" %}

## Auth0

[Auth0](https://auth0.com/) is a popular auth provider that is used by many web apps. There are many different integration methods with
Auth0, but, at a high level, there are two main patterns:

### Is the user session managed in the browser?

This integration pattern is most common in single page applications (SPAs). In these methods, the user session is managed in
the browser, and the browser is responsible for sending the session data to the backend with every request. Common SDKs used for this
pattern are [auth0-spa-js](https://github.com/auth0/auth0-spa-js) and [auth0-react](https://github.com/auth0/auth0-react).

By default, Auth0 stores user session data in JavaScript memory, which Meticulous cannot access while recording sessions. When Meticulous
tries to simulate these sessions, Auth0 will fail to refresh the session data and then will force a redirect to the login screen.

To fix this, you need to configure Auth0 to store user session data in \`localstorage\`. See Auth0's documentation [here](https://auth0.com/docs/libraries/auth0-single-page-app-sdk#change-storage-options)
for more information on how to set this configuration.

### Is the user session managed in the backend?

This integration pattern is most common in traditional web applications and in web applications that make heavy use of server-side rendering.
In these methods, the user session is managed in the backend, and the backend exposes this session to the frontend via cookies or headers.
Common SDKs used for this pattern are [auth0-node](https://github.com/auth0/node-auth0) and [nextjs-auth0](https://github.com/auth0/nextjs-auth0).

By default, Auth0 stores user session data in httpOnly cookies, which Meticulous cannot access while recording sessions. When Meticulous
tries to replay these sessions, Meticulous will not pass a session cookie when attempting to load the initial page, so Auth0 will force
a redirect to the login screen.

To fix this, you need to configure Auth0 to not use httpOnly cookies in the environments where Meticulous records sessions. This can be
accomplished by setting the \`AUTH0_COOKIE_HTTP_ONLY\` environment variable to false in the desired environments. See Auth0's documentation
[here](https://auth0.github.io/nextjs-auth0/types/config.ConfigParameters.html) for more information on how to set this configuration.

### Is the same Auth0 client being used across the record and replay environments?

If you have made the suggested changes from the previous sections and are still seeing auth issues, then it is possible that the Auth0
client is different between the record and simulation environments. Because live requests are being sent to Auth0 at simulation time
with session data collected at record time, the same Auth0 client must be used across record and simulation environments.

Please standardize your Auth0 client across environments, and try recording and simulating a session again.

{% /tab %}

{% tab label="Other" %}

## Other

### Is the same auth provider client being used across the record and replay environments?

Because live requests are often sent to auth providers at simulation time with session data collected at record time, the same auth provider
client must be used across record and simulation environments.

Please standardize your auth provider client across environments, and try recording and simulating a session again.

### Does your backend expose user session data to the browser exclusively via httpOnly cookies?

If your backend exclusively uses httpOnly cookies to expose user session data to the browser, then Meticulous will not be able to access
this data at record time. This will prevent Meticulous from passing a valid session cookie when loading the initial page at simulation time.

To fix this, please disable httpOnly cookies in the environments where Meticulous records sessions.

{% /tab %}

{% /tabs %}

## Issues / questions?

We're always happy to help you with any issues you encounter while setting up or with anything else you might be unsure about.

Get in touch by emailing [${METICULOUS_SUPPORT_EMAIL}](mailto:${METICULOUS_SUPPORT_EMAIL}).

`;
