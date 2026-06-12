---
"@alwaysmeticulous/api": minor
---

Add `ElementRedactionMode` and an optional `redactionMode` field on `CSSSelectorToIgnore`, letting each ignored element choose in which contexts it is hidden: `"always"`, `"replay-and-diff"` (default), or `"diff-only"`.
