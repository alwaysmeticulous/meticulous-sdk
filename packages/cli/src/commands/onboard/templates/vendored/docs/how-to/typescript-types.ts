export const document = `---
{
  "title": "TypeScript Types for window.Meticulous"
}
---

# {% $frontmatter.title %}

TypeScript definitions for the \`window.Meticulous\` object are available in the [\`@alwaysmeticulous/sdk-bundles-api\`](https://www.npmjs.com/package/@alwaysmeticulous/sdk-bundles-api) package.

## Installation

Install the package as a dev dependency:

\`\`\`bash
npm install --save-dev @alwaysmeticulous/sdk-bundles-api@latest
\`\`\`

## Usage

Import the type and extend the Window interface:

\`\`\`typescript
import type { MeticulousPublicApi } from '@alwaysmeticulous/sdk-bundles-api';

declare global {
  interface Window {
    Meticulous?: MeticulousPublicApi;
  }
}
\`\`\`

Now you have full type safety when using the \`window.Meticulous\` object:

\`\`\`typescript
// Detect if running as a test
if (window.Meticulous?.isRunningAsTest) {
  console.log('Running as a Meticulous test');
}

// Record session context with type safety
window.Meticulous?.context.recordUserId('user-123');
window.Meticulous?.context.recordUserEmail('user@example.com');
window.Meticulous?.context.recordFeatureFlag('myFlag', true);
window.Meticulous?.context.recordCustomContext('userRole', 'admin');
\`\`\`

## Full API Reference

For the complete type definition, see [public-window-api.ts](https://github.com/alwaysmeticulous/meticulous-sdk/blob/main/packages/sdk-bundles-api/src/window-api/public-window-api.ts) in the meticulous-sdk repository.
`;
