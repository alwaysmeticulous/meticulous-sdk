import { METICULOUS_SUPPORT_EMAIL } from "src/lib/next/next.constants";
import { METICULOUS_WINDOW_OBJECT_URL } from "src/lib/utils/internal-urls/docs-urls.utils";

export const document = `---
{
  "title": "Bypassing Auth"
}
---

# {% $frontmatter.title %}

If you are only using Meticulous to test your frontend, then Meticulous won't actually need to authenticate with your backend: it'll automatically
stub all network responses. However, it may get tripped up if it gets redirected to a login page when trying to simulate a session.

You can solve this by disabling the code that performs the redirect or auth check when running Meticulous tests in CI or against your preview URLs.

This can be done securely by setting a secret in the 'Custom Request Headers' tab of your project's settings screen, or, if the check or redirect
being disabled does not have security implications (and only UX implications), or is for localhost inside CI, then you can disable it in code by checking [the window variables or
request headers that Meticulous sets](${METICULOUS_WINDOW_OBJECT_URL}).

## Issues / questions?

We're always happy to help you with any issues you encounter while setting up or with anything else you might be unsure about.

Get in touch by emailing [${METICULOUS_SUPPORT_EMAIL}](mailto:${METICULOUS_SUPPORT_EMAIL}).

`;
