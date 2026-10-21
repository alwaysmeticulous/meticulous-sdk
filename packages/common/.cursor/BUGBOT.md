## Stored replay timeline order

If `getVirtualTimeOrder` (`src/virtual-time-order.utils.ts`) changes, check whether [`packages/replay-data-api/src/__docs__/stored-replay-timeline.md`](../../../packages/replay-data-api/src/__docs__/stored-replay-timeline.md) needs updating. It decides the order every replay timeline is written, loaded and streamed in, so a change reorders stored and loaded timelines alike; keep it free of Node-only imports, since `@alwaysmeticulous/common/virtual-time-order` is used in the browser.
