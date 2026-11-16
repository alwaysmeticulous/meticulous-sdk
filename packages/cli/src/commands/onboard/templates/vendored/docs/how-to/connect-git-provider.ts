import { METICULOUS_GITHUB_APP_INSTALL_URL } from "../constants";
import { linkBitbucketInstructions } from "./link-bitbucket";
import { linkGitLabInstructions } from "./link-gitlab";

export const connectGitProviderInstructions = `
{% tabs tabNameSpace="provider" %}
{% tab label="GitHub" %}

1. Sign in to [Meticulous](https://app.meticulous.ai) and create or select your organization.
2. Choose **Connect to GitHub** when creating the project.
3. [Install the Meticulous GitHub App](${METICULOUS_GITHUB_APP_INSTALL_URL}) for the organization and repositories you want Meticulous to test.
4. Return to Meticulous, select the repository, and create the linked project.

{% /tab %}
{% tab label="GitLab" %}

${linkGitLabInstructions}

{% /tab %}
{% tab label="Bitbucket" %}

${linkBitbucketInstructions}

{% /tab %}
{% /tabs %}
`;
