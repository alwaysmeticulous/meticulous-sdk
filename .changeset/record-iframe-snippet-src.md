---
"@alwaysmeticulous/record": patch
---

Set `window.__meticulous.snippetScriptSrc` during CLI recorder bootstrap so the recorder can auto-install into same-origin iframes. When the recorder is injected via Puppeteer's `evaluateOnNewDocument` there is no `<script>` tag to derive the snippet URL from, so iframe auto-install previously never ran. This fixes `record session` / `record login` (and other `bootstrapRecordingPage` consumers such as the crawler) not recording same-origin iframe content.
