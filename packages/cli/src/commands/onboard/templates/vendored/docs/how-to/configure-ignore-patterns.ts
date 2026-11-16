import { WHERE_CAN_I_REACH_OUT_FOR_SUPPORT } from "../constants";
import { ENABLE_SOURCE_COVERAGE_URL } from "src/lib/utils/internal-urls/docs-urls.utils";

export const document = `---
{
  "title": "Configuring Ignore Patterns for Coverage"
}
---

# {% $frontmatter.title %}

Meticulous uses a \`.meticulousignore\` file at the root of your repository to exclude files from [source coverage](${ENABLE_SOURCE_COVERAGE_URL}) tracking. The file follows the same syntax as [.gitignore](https://git-scm.com/docs/gitignore).

## Global ignore patterns

Create a \`.meticulousignore\` file at the root of your repository. Any file whose path matches a pattern in this file is excluded from coverage across all Meticulous projects that point to the repository.

\`\`\`
# .meticulousignore

# Exclude generated files
src/generated/**

# Exclude Storybook
apps/storybook/**

# Exclude mobile-specific files
**/*.ios.*
**/*.android.*
\`\`\`

## Project-specific ignore patterns (monorepos)

If your repository contains multiple Meticulous projects — for example, separate \`dashboard\` and \`admin\` apps in a monorepo — you can create per-project ignore files so that each project only tracks coverage for its own source files.

Create a \`.meticulousignore.{slug}\` file at the root of your repository, where \`{slug}\` is derived from your Meticulous project name (see [How the slug is computed](#how-the-slug-is-computed) below).

For example, a monorepo with a \`dashboard\` project and an \`admin\` project might have:

\`\`\`
# .meticulousignore.dashboard
# Applied only when running coverage for the "dashboard" project

apps/admin/**
\`\`\`

\`\`\`
# .meticulousignore.admin
# Applied only when running coverage for the "admin" project

apps/dashboard/**
\`\`\`

Patterns from \`.meticulousignore\` (global) and \`.meticulousignore.{slug}\` (project-specific) are merged together, so both apply at the same time.

## How the slug is computed

The slug is derived from your Meticulous project name using these steps:

1. Convert to lowercase
2. Replace any character that is not alphanumeric, a hyphen (\`-\`), or an underscore (\`_\`) with a hyphen
3. Collapse consecutive hyphens into a single hyphen
4. Strip any leading or trailing hyphens

| Project name | Ignore file |
|---|---|
| \`dashboard\` | \`.meticulousignore.dashboard\` |
| \`my-next-cloudflare-app\` | \`.meticulousignore.my-next-cloudflare-app\` |
| \`meticulous_app\` | \`.meticulousignore.meticulous_app\` |
| \`My Dashboard App\` | \`.meticulousignore.my-dashboard-app\` |
| \`apps/admin\` | \`.meticulousignore.apps-admin\` |
| \`My App (v2)\` | \`.meticulousignore.my-app-v2\` |

Your project name is shown in the Meticulous UI in the top-left of your project's page, and in the URL: \`app.meticulous.ai/projects/{org}/{project-name}\`.

${WHERE_CAN_I_REACH_OUT_FOR_SUPPORT}
`;
