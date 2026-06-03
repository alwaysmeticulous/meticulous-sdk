---
"@alwaysmeticulous/client": patch
---

Allow consumers to append an app identifier to the client `User-Agent` (e.g. `@alwaysmeticulous/client/<version> report-diffs-action/cloud-compute@v1`), so backend logs can attribute traffic to a specific consumer and version. The suffix comes from the new `appInfo` option on `createClient`, falling back to the `METICULOUS_CLIENT_USER_AGENT_SUFFIX` env var — the env var also reaches clients built deep inside dependencies (e.g. the bundled `remote-replay-launcher`'s own client) where threading an option through is not possible.
