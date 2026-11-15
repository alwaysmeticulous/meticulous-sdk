// The workspace doesn't install chromium-bidi (see its `pnpm.overrides` note in
// the root package.json). puppeteer-core only reaches it through a dynamic
// import when connecting with `protocol: "webDriverBiDi"`, which the CLI never
// does; this keeps that path failing loudly instead of leaving an unresolved
// runtime import in the bundle.
const unsupported = (): never => {
  throw new Error(
    "WebDriver BiDi is not supported by the Meticulous CLI: chromium-bidi is not bundled",
  );
};

export const BidiMapper: unknown = new Proxy({}, { get: unsupported });
