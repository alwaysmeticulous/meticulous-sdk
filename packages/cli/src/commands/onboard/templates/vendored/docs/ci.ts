import { GITHUB_ACTIONS_SETUP_URL } from "src/lib/utils/internal-urls/docs-urls.utils";

export const document = `---
{
  "title": "Setting up Meticulous to test your pull requests"
}
---

# {% $frontmatter.title %}

There are two ways to run Meticulous tests on your pull requests. We recommend the following approaches, in order of preference:

1. **Upload static assets** — If your app can be served as a folder of static files (HTML/JS/CSS), this is the simplest approach. Not suitable for apps that require server-side rendering (e.g. Next.js). [Get started here](${GITHUB_ACTIONS_SETUP_URL}).
2. **Upload a container image** — If your app requires a server (e.g. Next.js, SSR), upload a Docker image and we'll run it for you. This is the recommended approach for most apps. [Get started here](${GITHUB_ACTIONS_SETUP_URL}).
`;
