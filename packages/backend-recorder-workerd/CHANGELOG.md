# @alwaysmeticulous/backend-recorder-workerd

## 2.315.0

### Minor Changes

- [#11317](https://github.com/alwaysmeticulous/meticulous/pull/11317) [`f92d563`](https://github.com/alwaysmeticulous/meticulous/commit/f92d5637fbaf6ca1941394185db539f80c9d2aaf) Thanks [@alexivanov](https://github.com/alexivanov)! - Add backend session recording for Cloudflare Workers (workerd) apps during local development. The new `@alwaysmeticulous/backend-recorder-workerd` package provides a `withMeticulous` handler wrapper that captures inbound requests and outgoing `fetch` calls, and the new `meticulous record backend` CLI command starts the Meticulous recorder sidecar and wraps your dev command (e.g. `meticulous record backend -- npx wrangler dev`).
