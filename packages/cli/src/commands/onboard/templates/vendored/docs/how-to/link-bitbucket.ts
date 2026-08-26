export const linkBitbucketInstructions = `
1. Create a **repository access token** in Bitbucket:
    - Open your repository in Bitbucket Cloud → **Repository settings** → **Access tokens** → **Create repository access token**
    ([guide](https://support.atlassian.com/bitbucket-cloud/docs/create-a-repository-access-token/))
    - Grant **Repositories: Read** and **Pull requests: Read**
2. In Meticulous, link the repository and paste the token:
    - When creating a Bitbucket project, or from **Project settings → CI settings → Linked repository**
    - Enter your Bitbucket **workspace**, **repository slug**, and paste the access token (it is stored securely and never shown again)
3. Add the Meticulous webhook in Bitbucket (**Repository settings → Webhooks → Add webhook**):
    - Use the **Webhook URL** and **Secret** shown by Meticulous after linking
    - Enable the pull request **Updated**, **Merged**, **Declined**, and **Superseded** triggers
`;

export const bitbucketRepositoryAccessTokenPermissionsSummary =
  "Repositories: Read and Pull requests: Read";
