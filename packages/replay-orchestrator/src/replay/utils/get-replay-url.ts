import { Replay } from "@alwaysmeticulous/api";

export const getReplayUrl = (replay: Replay) => {
  const organizationName = encodeURIComponent(replay.project.organization.name);
  const projectName = encodeURIComponent(replay.project.name);
  const replayUrl = `https://app.meticulous.ai/projects/${organizationName}/${projectName}/simulations/${replay.id}`;
  return replayUrl;
};
