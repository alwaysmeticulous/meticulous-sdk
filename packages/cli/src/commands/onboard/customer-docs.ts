import customerDocs from "./customer-docs.json";

/**
 * The public-docs source files (webapp-frontend docs content) that the
 * customer-facing agent playbooks cite as `.claude/docs/<path>`. They must be
 * bundled into the onboard workspace: the live docs pages render the
 * framework-specific recorder snippets and the GitLab/Bitbucket CI tabs
 * client-side, so a WebFetch of the page cannot retrieve them.
 *
 * Read from JSON so `scripts/copy-onboard-templates.mjs` can share the same
 * list without duplicating it (same pattern as customer-agents.json).
 */
export const CUSTOMER_DOC_FILES: readonly string[] = customerDocs.docFiles;

/** Doc directories copied recursively (framework-specific recorder snippets). */
export const CUSTOMER_DOC_DIRS: readonly string[] = customerDocs.docDirs;

/**
 * webapp-frontend modules outside the docs content directory that those docs
 * import constants from (doc URLs, support email). Not copied into the
 * workspace: they are read while inlining those constants into the docs, so the
 * published build mirrors them at the same `src/...` paths the imports use.
 */
export const CUSTOMER_DOC_IMPORT_FILES: readonly string[] =
  customerDocs.importFiles;
