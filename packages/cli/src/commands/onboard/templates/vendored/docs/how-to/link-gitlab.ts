export const gitLabLegacyTokenScopesSummary =
  "api (required) and read_repository";

export const gitLabLegacyTokenPrefillUrl =
  "https://gitlab.com/-/user_settings/personal_access_tokens?name=Meticulous&scopes=api,read_repository";

export const linkGitLabInstructions = `
1. Create a **legacy** GitLab personal access token (not a fine-grained token):
    - Go to your avatar → **Edit profile** → **Personal access tokens**
    - Choose **Add legacy token** (or **Create legacy token**), not **Generate fine-grained token**
    - Under **Scopes**, enable **api** and **read_repository**
    ([guide](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html#create-a-personal-access-token))
    - Your GitLab user must have **Maintainer** or **Owner** on the project
    - Alternatively, a **project access token** (Premium/Ultimate on GitLab.com) with the same scopes and **Maintainer** role works
    ([project token guide](https://docs.gitlab.com/ee/user/project/settings/project_access_tokens.html#create-a-project-access-token))
2. In Meticulous, link the repository and paste the token:
    - When creating a GitLab project, or from **Project settings → CI settings → Linked repository**
    - Enter your GitLab **project ID** (from **Settings → General** in GitLab), paste the access token, and configure the webhook shown after linking
3. Add the Meticulous webhook in GitLab (**Settings → Webhooks**):
    - Use the **Webhook URL** and **Secret token** from Meticulous
    - Enable **Merge request events**
`;
