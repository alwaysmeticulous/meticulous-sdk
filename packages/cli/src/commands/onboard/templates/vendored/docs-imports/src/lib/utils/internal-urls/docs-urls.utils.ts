import { AGENT_INSTRUCTIONS_DOCS_PATH } from "@alwaysmeticulous/webapp-frontend-backend-shared";

export const DOCS_URL = "/docs";

export const CHANGELOG_URL = "/changelog";

/** True for docs/changelog pages and same-page anchors — links that should render as internal, not external. */
export const isInternalDocLink = (href: string): boolean =>
  href.startsWith(DOCS_URL) ||
  href.startsWith(CHANGELOG_URL) ||
  href.startsWith("#");

export const getChangelogEntryUrl = (slug: string): string =>
  `${CHANGELOG_URL}/${slug}`;

/** Page 1 is `/changelog`; page 2+ is `/changelog/page/<n>`. */
export const getChangelogPageUrl = (page: number): string =>
  page <= 1 ? CHANGELOG_URL : `${CHANGELOG_URL}/page/${page}`;

export const ONBOARDING_GUIDE_URL = "/docs/onboarding-guide";

export const INSTALL_RECORDER_URL = "/docs/recorder-installation";

export const CI_SETUP_URL = "/docs/ci";

export const GITHUB_ACTIONS_SETUP_URL = "/docs/github-actions-v2";

export const MAKE_CHECK_BLOCKING_URL = "/docs/make-check-blocking";

export const CLOUD_REPLAY_URL = "/docs/cloud-replay";

export const TESTING_POOL_URL = "/docs/how-to/testing-pool";

export const INSTALL_RECORDER_AS_SCRIPT_TAG_URL =
  "/docs/how-to/recorder-script";

export const INSTALL_RECORDER_AS_NPM_DEPENDENCY_URL =
  "/docs/session-recording/recorder-npm-dependency";

export const INGEST_EXISTING_TESTS_URL =
  "/docs/session-recording/ingest-existing-tests";

export const INSTALLATION_INSTRUCTIONS_ANCHOR = "installation-instructions";

export const INSTALL_RECORDER_AS_SCRIPT_TAG_INSTALLATION_INSTRUCTIONS_URL = `${INSTALL_RECORDER_AS_SCRIPT_TAG_URL}#${INSTALLATION_INSTRUCTIONS_ANCHOR}`;

export const INSTALL_RECORDER_AS_NPM_DEPENDENCY_INSTALLATION_INSTRUCTIONS_URL = `${INSTALL_RECORDER_AS_NPM_DEPENDENCY_URL}#${INSTALLATION_INSTRUCTIONS_ANCHOR}`;

export const RECORD_A_TEST_MANUALLY_URL =
  "/docs/how-to/manually-recording-tests";

export const DETECT_DIFFS_LOCALLY_URL = "/docs/how-to/detect-diffs-locally";

export const PREPARE_FOR_TESTS_URL = "/docs/how-to/prepare-for-tests";

export const METICULOUS_WINDOW_OBJECT_URL =
  "/docs/how-to/window-meticulous-object";

export const RECORDER_DEVELOPER_TOOLS_URL =
  "/docs/how-to/recorder-developer-tools";

export const TYPESCRIPT_TYPES_URL = "/docs/how-to/typescript-types";

export const TESTING_MULTIPLE_APPS_URL =
  "/docs/how-to/testing-multiple-apps-or-app-variants";

export const TESTING_FEATURE_FLAGS = "/docs/how-to/testing-feature-flags";

export const RECORD_AND_REPLAY_ON_DIFFERENT_ENVIRONMENTS_URL =
  "/docs/how-to/record-and-replay-on-different-environments";

export const FIX_FALSE_POSITIVES_URL = "/docs/how-to/fix-false-positive-diffs";

export const RECORD_CUSTOM_VALUES_URL = "/docs/how-to/record-custom-values";

export const RECORD_SESSION_CONTEXT_URL = "/docs/how-to/record-session-context";

const IGNORE_URL_PATTERNS_URL = "/docs/how-to/ignore-url-patterns";

export const TROUBLESHOOT_AUTH_URL = "/docs/how-to/troubleshoot-auth";
export const AUTH_ENABLING_FULL_AUTH_URL =
  "/docs/how-to/auth/enabling-full-auth";
export const AUTH_BYPASSING_AUTH_URL = "/docs/how-to/auth/bypassing-auth";

export const TROUBLESHOOT_RECORDER_URL = "/docs/how-to/troubleshoot-recorder";
export const RECORDER_CSP_EXCEPTIONS_URL =
  "/docs/session-recording/csp-exceptions";

// NOTE: this URL is also used here in replay-launcher/src/launch-browser-and-replay.ts
export const TROUBLESHOOT_REPLAY_ACCURACY_URL =
  "/docs/how-to/troubleshoot-replay-accuracy";

export const FAQ_AND_TROUBLESHOOTING_URL = "/docs/faq-and-troubleshooting";

export const BASE_URL_EXPLANATION_URL = `${FAQ_AND_TROUBLESHOOTING_URL}#base-urls`;

/**
 * Deep dive on how recorded network traffic is stubbed, matched, and patched.
 * Short FAQ answer remains at {@link FAQ_AND_TROUBLESHOOTING_URL}#data-variants.
 */
export const NETWORK_STUBBING_EXPLANATION_URL =
  "/docs/concepts/network-recording-and-patching";

export const BRANCHES_REQUIRED_TO_RUN_ON_URL = `${FAQ_AND_TROUBLESHOOTING_URL}#branches-must-run-on`;

export const ENSURE_RECORDER_CAPTURES_ALL_REQUESTS_URL = `/docs/how-to/ensure-recorder-captures-all-requests`;

export const ENABLE_SOURCE_COVERAGE_URL = `/docs/how-to/enable-source-coverage`;

export const BLOCKED_REQUESTS_URL = `/docs/how-to/blocked-requests`;

export const CONFIGURE_IGNORE_PATTERNS_URL = `/docs/how-to/configure-ignore-patterns`;

export const BUILT_IN_CHECKS_URL = "/docs/built-in-checks";

export const BUILT_IN_CHECKS_ACCESSIBILITY_URL =
  "/docs/built-in-checks/accessibility";

export const BUILT_IN_CHECKS_NETWORK_REQUESTS_URL =
  "/docs/built-in-checks/network-requests";

export const BUILT_IN_CHECKS_REACT_COMPONENT_RENDERS_URL =
  "/docs/built-in-checks/react-component-renders";

export const CUSTOM_CHECKS_URL = "/docs/custom-checks";

export const CUSTOM_CHECKS_WRITING_A_CUSTOM_CHECK_URL =
  "/docs/custom-checks/writing-a-custom-check";

export const CUSTOM_CHECKS_RECORDING_CUSTOM_DATA_URL =
  "/docs/custom-checks/recording-custom-data";

export const CUSTOM_CHECKS_BUILT_IN_SNAPSHOT_TYPES_URL =
  "/docs/custom-checks/built-in-snapshot-types";

export const CUSTOM_CHECKS_BEST_PRACTICES_URL =
  "/docs/custom-checks/best-practices";

export const NEXTJS_APP_ROUTER_ADDITIONAL_SETUP_URL = `/docs/frameworks/nextjs/app-router`;

export const NEXTJS_APP_ROUTER_ENSURING_DETERMINISM_ANCHOR =
  "ensure-determinism";

export const NEXTJS_APP_ROUTER_ENSURING_DETERMINISM_URL = `/docs/frameworks/nextjs/app-router#${NEXTJS_APP_ROUTER_ENSURING_DETERMINISM_ANCHOR}`;

export const CREATE_DEPLOYMENTS_ON_GITHUB_URL =
  "/docs/alternative-ci-setups/create-deployments-on-github";

const TROUBLESHOOTING_FAILED_SIMULATIONS_ANCHOR =
  "troubleshoot-failed-simulations";

export const TROUBLESHOOTING_FAILED_SIMULATIONS_STEPS_ANCHOR =
  "/docs/how-to/troubleshoot-failed-simulations-steps";

export const TROUBLESHOOTING_FAILED_SIMULATIONS_URL =
  "/docs/how-to/troubleshoot-failed-simulations";

export const TROUBLESHOOTING_FAILED_SIMULATIONS_STEPS_URL = `/docs/how-to/troubleshoot-failed-simulations#${TROUBLESHOOTING_FAILED_SIMULATIONS_STEPS_ANCHOR}`;

export const COMPANION_ASSETS_ADVANCED_URL =
  "/docs/how-to/companion-assets-advanced";

export const TUNNEL_ADVANCED_OPTIONS_URL =
  "/docs/how-to/tunnel-advanced-options";

export const INCREMENTAL_ASSET_UPLOAD_URL =
  "/docs/how-to/incremental-asset-upload";

export const FILTER_SESSIONS_BY_START_URL_URL =
  "/docs/how-to/filter-sessions-by-start-url";

// Framework-specific guides
export const NEXTJS_PAGES_ROUTER_URL = "/docs/frameworks/nextjs/pages-router";

export const REACT_VITE_URL = "/docs/frameworks/react/vite";

export const REACT_CRA_URL = "/docs/frameworks/react/create-react-app";

export const VUE_VITE_URL = "/docs/frameworks/vue/vite";

export const ANGULAR_CLI_URL = "/docs/frameworks/angular/angular-cli";

// Concepts
export const ARCHITECTURE_OVERVIEW_URL = "/docs/concepts/architecture-overview";

/** Alias for {@link NETWORK_STUBBING_EXPLANATION_URL}. */
export const NETWORK_RECORDING_AND_PATCHING_URL =
  NETWORK_STUBBING_EXPLANATION_URL;

export const GLOSSARY_URL = "/docs/concepts/glossary";

// Agents
export const AGENTS_SETUP_URL = "/docs/agents/setup";

/**
 * Agent-addressed version of the setup guide. Deliberately absent from the docs
 * sidebar - it's linked from the setup guide and from the webapp's agent notes.
 */
export const AGENTS_SETUP_FOR_AGENTS_URL = AGENT_INSTRUCTIONS_DOCS_PATH;

export const AGENT_REVIEW_DOCS_URL = "/docs/agents/agent-review";

export const AGENTS_WHATS_NEW_URL = "/docs/agents/whats-new";

export const AGENTS_CLI_COMMANDS_URL = "/docs/agents/cli-commands";

export const AGENTS_MCP_SERVER_URL = "/docs/agents/mcp-server";

export const AGENTS_SKILLS_URL = "/docs/agents/skills";

// App
export const USER_SETTINGS_URL = "/user-settings";

// Reference
export const CLI_COMMANDS_URL = "/docs/reference/cli-commands";

export const ENVIRONMENT_VARIABLES_URL =
  "/docs/reference/environment-variables";

export const PERFORMANCE_API_URL = "/docs/reference/performance-api";

export const ADDITIONAL_GUIDES = {
  GETTING_STARTED_BACKEND_TESTING_URL:
    "/docs/additional-guides/getting-started-backend-testing",
  INSTALL_RECORDER_SCRIPT_FOR_BACKEND_TESTING_URL:
    "/docs/additional-guides/recorder-script-backend-testing",
  INSTALL_BACKEND_RECORDER_URL: "/docs/additional-guides/backend-recorder",
  EXPORTING_GENERATED_TESTS_URL: "/docs/export/exporting-generated-tests",
  CONTROLLING_DATA_RECORDED_URL:
    "/docs/session-recording/controlling-data-recorded",
  CONTROLLING_WHEN_RECORDING_STARTS_AND_STOPS_URL:
    "/docs/session-recording/controlling-when-recording-starts-and-stops",
  REDACTION_URL: "/docs/session-recording/redaction",
  NOT_YET_RUN_CHECKS_URL: "/docs/ci/not-yet-run-checks",
  RETRY_TEST_RUN_URL: "/docs/how-to/retry-test-run",
  HANDLE_FILE_UPLOADS_URL: "/docs/how-to/handle-file-uploads",
};

export const ADDITIONAL_GUIDES_URL = "/docs/additional-guides";

export const USE_CUSTOM_EVENT_API_URL = "/docs/how-to/use-custom-event-api";

export const CONTROLLING_DATA_RECORDED_URL =
  ADDITIONAL_GUIDES.CONTROLLING_DATA_RECORDED_URL;

export const CONTROLLING_WHEN_RECORDING_STARTS_AND_STOPS_URL =
  ADDITIONAL_GUIDES.CONTROLLING_WHEN_RECORDING_STARTS_AND_STOPS_URL;

export const REDACTION_URL = ADDITIONAL_GUIDES.REDACTION_URL;

export const RETRY_TEST_RUN_URL = ADDITIONAL_GUIDES.RETRY_TEST_RUN_URL;

export const HANDLE_FILE_UPLOADS_URL =
  ADDITIONAL_GUIDES.HANDLE_FILE_UPLOADS_URL;
