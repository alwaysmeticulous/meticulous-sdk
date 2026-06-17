---
"@alwaysmeticulous/remote-replay-launcher": minor
"@alwaysmeticulous/client": minor
"@alwaysmeticulous/cli": minor
"@alwaysmeticulous/api": minor
---

Add support for uploading assets as incremental chunks. New `ci upload-asset-chunk` and `ci run-with-uploaded-asset-chunks` CLI commands upload each asset chunk as a compressed `tar` archive to a signed URL, skipping chunks the server already has and warning on overlapping files.
