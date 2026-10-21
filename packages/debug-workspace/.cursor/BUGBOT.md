## Stored replay timeline order and indices

If code that reads replay timelines or writes the derived timeline files changes, check whether [`packages/replay-data-api/src/__docs__/stored-replay-timeline.md`](../../../packages/replay-data-api/src/__docs__/stored-replay-timeline.md) needs updating. Flag code that orders timeline entries by virtual time other than through `getVirtualTimeOrder` (via `inVirtualTimeOrder`), rewrites the stored `timeline.ndjson` in a different order, or numbers derived-file entries by anything other than their position in `timeline.ndjson`.
