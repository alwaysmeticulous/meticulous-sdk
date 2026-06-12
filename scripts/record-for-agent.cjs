#!/usr/bin/env node
/**
 * Start a Meticulous recording session with CDP exposed for agent-browser.
 *
 * Usage:
 *   met_set_token org/project
 *   node scripts/record-for-agent.cjs [--appUrl=<url>] [--remoteDebuggingPort=9222]
 *
 * Then in another terminal:
 *   agent-browser connect 9222
 *   agent-browser snapshot
 */
const { join } = require("path");
const {
  createClient,
  getProject,
  getRecordingCommandId,
  postSessionIdNotification,
} = require("@alwaysmeticulous/client");
const {
  getCommitSha,
  getMeticulousLocalDataDir,
  initLogger,
} = require("@alwaysmeticulous/common");
const { fetchAsset } = require("@alwaysmeticulous/downloading-helpers");
const { recordSession } = require("../packages/record/dist/record/record");

const parseArgs = () => {
  const args = Object.fromEntries(
    process.argv.slice(2).flatMap((arg) => {
      const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
      return match ? [[match[1], match[2] ?? true]] : [];
    }),
  );
  return {
    appUrl:
      args.appUrl ??
      "https://atlaskit.atlassian.com/examples/editor/editor-core/kitchen-sink",
    remoteDebuggingPort: Number(args.remoteDebuggingPort ?? 9222),
  };
};

const main = async () => {
  const { appUrl, remoteDebuggingPort } = parseArgs();
  const apiToken = process.env.METICULOUS_API_TOKEN;

  if (!apiToken) {
    console.error(
      "METICULOUS_API_TOKEN is not set. Run met_set_token org/project first.",
    );
    process.exit(1);
  }

  initLogger();
  const client = createClient({ apiToken });
  const project = await getProject(client);

  if (!project?.recordingToken) {
    console.error("Could not retrieve project or recording token.");
    process.exit(1);
  }

  const recordingSnippet = await fetchAsset("v1/meticulous.js");
  const cookieDir = join(getMeticulousLocalDataDir(), "cookies");
  const commitSha = (await getCommitSha()) || "unknown";
  const recordingCommandId = await getRecordingCommandId(client, project.id);

  await recordSession({
    recordingToken: project.recordingToken,
    appCommitHash: commitSha,
    recordingSnippet,
    incognito: false,
    cookieDir,
    captureHttpOnlyCookies: true,
    appUrl,
    remoteDebuggingPort,
    onDetectedSession: (sessionId) => {
      const org = encodeURIComponent(project.organization.name);
      const name = encodeURIComponent(project.name);
      console.log(
        `Recording session: https://app.meticulous.ai/projects/${org}/${name}/sessions/${sessionId}`,
      );
      postSessionIdNotification(
        client,
        sessionId,
        recordingCommandId,
        project.id,
      ).catch(console.error);
    },
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
