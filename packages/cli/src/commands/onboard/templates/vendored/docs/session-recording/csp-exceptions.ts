export const document = `---
{
  "title": "Content Security Policy (CSP) exceptions for the recorder snippet"
}
---

# {% $frontmatter.title %}

If you have a strict Content Security Policy (CSP) in place, you may need to add the following exceptions to allow the Meticulous recorder to work correctly:

 - \`frame-src\`: https://snippet.meticulous.ai
 - \`script-src\`: https://snippet.meticulous.ai
 - \`script-src\`: https://browser.sentry-cdn.com
 - \`connect-src\`: https://cognito-identity.us-west-2.amazonaws.com
 - \`connect-src\`: https://user-events-v3.s3-accelerate.amazonaws.com
 - \`connect-src\`: *.sentry.io
`;
