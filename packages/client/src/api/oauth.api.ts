import type { MeticulousClient, Response } from "../types/client.types";

export interface WhoamiOrganization {
  id: string;
  name: string;
  /**
   * The caller's `OrganizationMembership.role` for this organization (one of
   * `owner` | `member` | `reader`). Optional for forward-compatibility with
   * older backends that do not yet populate it.
   */
  role?: string;
}

export interface WhoamiResponse {
  email: string;
  firstName: string;
  lastName: string;
  isAdmin?: boolean;
  organizations: WhoamiOrganization[];
}

export const getWhoami = async (
  client: MeticulousClient,
): Promise<WhoamiResponse> => {
  const { data } = await client.get<WhoamiResponse>("oauth/whoami");
  return data;
};

export interface OAuthProject {
  id: string;
  name: string;
  organization: { id: string; name: string };
}

export interface OAuthProjectsResponse {
  projects: OAuthProject[];
}

export const getOAuthProjects = async (
  client: MeticulousClient,
): Promise<OAuthProject[]> => {
  const { data } = await client.get<OAuthProjectsResponse>("oauth/projects");
  return data.projects;
};

export interface OAuthDefaultProjectResponse {
  projectId: string | null;
  name?: string;
  organization?: { id: string; name: string };
}

/**
 * The OAuth caller's default project — set via `auth set-project` (or the
 * "CLI & MCP" section of the web app's user settings) and consulted by any
 * OAuth-authenticated call that omits `projectId`/`--project`. Server-side
 * (not a local file), so it's consistent across machines and visible to the
 * hosted MCP server, which has no access to a user's local files.
 *
 * By default the backend transiently auto-picks the caller's sole accessible
 * project when none is stored. Pass `includeAutoPick: false` to get only the
 * *stored* preference (no auto-pick) — needed to tell a real stored default
 * apart from an auto-pick.
 */
export const getOAuthDefaultProject = async (
  client: MeticulousClient,
  opts?: { includeAutoPick?: boolean },
): Promise<OAuthDefaultProjectResponse> => {
  const path =
    opts?.includeAutoPick === false
      ? "oauth/default-project?includeAutoPick=false"
      : "oauth/default-project";
  const { data } = await client.get<OAuthDefaultProjectResponse>(path);
  return data;
};

/**
 * Sets the default project. `project` is resolved flexibly server-side — a
 * bare id, an `"organization/name"` slug, or (if it uniquely identifies one
 * of the caller's accessible projects) a bare project name — see
 * `ProjectService.resolveForUserByIdentifier`. Use `clearOAuthDefaultProject`
 * to clear it.
 */
export const setOAuthDefaultProject = async (
  client: MeticulousClient,
  project: string,
): Promise<OAuthDefaultProjectResponse> => {
  const { data } = await client.put<
    { project: string },
    Response<OAuthDefaultProjectResponse>
  >("oauth/default-project", { project });
  return data;
};

export const clearOAuthDefaultProject = async (
  client: MeticulousClient,
): Promise<OAuthDefaultProjectResponse> => {
  const { data } = await client.delete<OAuthDefaultProjectResponse>(
    "oauth/default-project",
  );
  return data;
};
