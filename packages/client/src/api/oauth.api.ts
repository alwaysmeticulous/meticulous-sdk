import type { MeticulousClient } from "../types/client.types";

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
