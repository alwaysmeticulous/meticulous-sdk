import type { Options as YargsOptions } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";

/** The `ci agent-test` command's options. */
export const AGENT_TEST_OPTIONS: Record<string, YargsOptions> = {
  apiToken: OPTIONS.apiToken,
  commitSha: OPTIONS.commitSha,
  repoDirectory: {
    string: true,
    description:
      "The path to a git repository (or worktree). Infers --commitSha from the repo when --commitSha is not given. " +
      "With --uploadSource, the checkout the source of --baseSha..--commitSha is packaged from.",
  },
  previewUrl: {
    string: true,
    description:
      "Public HTTPS URL of the frontend, loaded directly by the run's browser instead of uploading a build.",
  },
  basePreviewUrl: {
    string: true,
    description:
      "Explicit base preview URL to compare --previewUrl against. Requires --baseSha: the revision the base URL serves.",
  },
  previewUrlAgentSwarm: {
    boolean: true,
    description:
      "Launch the preview-URL Agent swarm: agents test the live preview at --backendUrl, which serves every path, backend included. " +
      "It is configured, reported and superseded apart from the regular Agent swarm, with its own status check and pull request comment. " +
      "--assetsDir is optional (a placeholder is uploaded) and --backendProxyPaths defaults to /.",
  },
  deploymentId: {
    string: true,
    description:
      "A build already uploaded with `meticulous agent upload-build` (the deploymentId it printed), instead of uploading --assetsDir or --localImageTag again.",
  },
  baseSha: {
    string: true,
    description:
      "With --basePreviewUrl: the revision the base preview serves. With --uploadSource: the commit the change is diffed against, e.g. the merged pull request's base.",
  },
  uploadSource: {
    boolean: true,
    description:
      "Upload the source of --baseSha..--commitSha from --repoDirectory (as a git bundle of the two trees, without history) so Agent swarm can read the diff and code. " +
      "Defaults to on for projects with no connected GitHub, GitLab or Bitbucket repository, which have no other source. Only committed changes are uploaded.",
  },
  headTestRunId: {
    string: true,
    description:
      "Projects without a hosting provider: the session-replay test run of this build, so Agent swarm compares against that run's base build.",
  },
  localImageTag: {
    string: true,
    description:
      "The local Docker image tag of the app under test (e.g., 'myapp:latest' or image SHA)",
  },
  assetsDir: {
    string: true,
    description:
      "A directory of built frontend assets to upload and serve to the agent.",
  },
  backendUrl: {
    string: true,
    description:
      "HTTPS staging backend URL. Login credentials and options are read from METICULOUS_STAGING_* environment variables and forwarded to the project's configured login flow: " +
      "METICULOUS_STAGING_USERNAME and METICULOUS_STAGING_PASSWORD, plus flow-specific values such as METICULOUS_STAGING_TOTP_SECRET (base32 TOTP seed) or METICULOUS_STAGING_SKIP_EMAIL_CLIENT_ID (trusted-automation id that bypasses an email verification challenge).",
  },
  backendProxyPaths: {
    array: true,
    string: true,
    description:
      "Same-origin path prefixes to reverse proxy to the staging backend. " +
      "Defaults to /api for uploaded assets; with a container, passing it " +
      "opts into the worker's same-origin fronting proxy (experimental).",
  },
  backendUrlEnvVariable: {
    string: true,
    description:
      "With --localImageTag and --backendUrl: the name of the env var the " +
      "container image reads its backend origin from at runtime. Defaults " +
      "to METICULOUS_BACKEND_URL.",
  },
  appPort: {
    number: true,
    description:
      "Loopback app-server port for uploaded assets or containers with --backendProxyPaths. Defaults to 8000 on the worker. " +
      "The run fails if the port is unavailable — there is no fallback — so staging " +
      "CORS allowlists can pin http://localhost:<port>. Container targets require --backendUrl and --backendProxyPaths.",
  },
  egressRule: {
    array: true,
    string: true,
    description:
      "Extra Agent swarm browser egress rule for this launch, in action:domain-or-IP[,domain-or-IP...][:port[,port...]] form, e.g. allow:js.stripe.com,fonts.googleapis.com:443. Repeat to add ordered rules after the project's saved rules.",
  },
  hostRewriteRegex: {
    string: true,
    description:
      "Regex matching URL.host values to rewrite onto the app origin for this launch. Overrides the project's saved Agent swarm host-rewrite regex. Empty string disables it.",
  },
  instructionsFile: {
    string: true,
    description:
      "Path to a markdown file that overrides the agent instructions in " +
      ".meticulous/agent-swarm-instructions.md at --commitSha (e.g. routes and accounts to use).",
  },
  enableLocalMocks: {
    boolean: true,
    description:
      "Mock the container's network traffic from relevant recorded sessions.",
  },
  containerPort: {
    number: true,
    description: "The port to expose the container on.",
  },
  containerEnv: {
    array: true,
    coerce: (value: string[]) =>
      value.map((v) => {
        const [name, ...rest] = v.split("=");
        const envValue = rest.join("=");
        if (!name || !envValue) {
          throw new Error(`Invalid environment variable: ${v}`);
        }
        return { name, value: envValue };
      }),
    description: "The environment variables to set in the container.",
  },
  containerHealthCheckEndpoint: {
    string: true,
    description:
      "The endpoint path to use for health checks on the container (e.g., '/health').",
  },
  dryRun: {
    boolean: true,
    description: "Validate the options and exit without launching a run.",
  },
  json: {
    boolean: true,
    description:
      "Print the result as JSON on stdout: swarmRunId (null when the launch was skipped or deferred, with the reason in message), swarmKind when the backend reports it, commitSha, and the deploymentId, previewUrl or uploadId. " +
      "Without it, a launched run prints a line 'Agent swarm run: <id>'.",
  },
};
