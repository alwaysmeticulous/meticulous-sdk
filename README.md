# Meticulous SDK

[![npm version](https://img.shields.io/npm/v/@alwaysmeticulous/cli.svg)](https://www.npmjs.com/package/@alwaysmeticulous/cli)
[![GitHub stars](https://img.shields.io/github/stars/alwaysmeticulous/meticulous-sdk.svg?style=social)](https://github.com/alwaysmeticulous/meticulous-sdk)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

The official SDK for [Meticulous](https://meticulous.ai) - automated end-to-end testing that eliminates test maintenance.

## What is Meticulous?

Meticulous automatically creates and maintains a comprehensive test suite for your web application by recording real user interactions. When you open a pull request, Meticulous replays these user sessions against both the old and new versions of your app, identifying visual and functional differences.

### Key Benefits

- **Zero maintenance tests** - Tests evolve automatically as your app changes
- **Unprecedented coverage** - Scale to thousands of tests without writing code
- **Catch regressions early** - Detect breaking changes before they reach production
- **Record real user flows** - Tests reflect actual usage patterns, not assumptions

## Getting Started

Install the CLI:

```bash
npm install --save-dev @alwaysmeticulous/cli
```

Record a session:

```bash
npx @alwaysmeticulous/cli record --apiToken="<API_TOKEN>"
```

For complete setup instructions, see the [Meticulous documentation](https://app.meticulous.ai/docs).

## Packages

This monorepo contains the following packages. Each package has its own detailed README with additional documentation:

- **[@alwaysmeticulous/cli](./packages/cli)** - CLI tool for running Meticulous tests ([docs](./packages/cli/README.md))
- **[@alwaysmeticulous/recorder-loader](./packages/recorder-loader)** - Session recorder for capturing user interactions
- **[@alwaysmeticulous/sdk-bundles-api](./packages/sdk-bundles-api)** - Core SDK bundle APIs
- **Additional packages** - Supporting libraries for replay orchestration, API clients, and more

## Documentation

- [Full Documentation](https://app.meticulous.ai/docs)
- [Onboarding Guide](https://app.meticulous.ai/docs/onboarding-guide)
- [GitHub Issues](https://github.com/alwaysmeticulous/meticulous-sdk/issues)

## Development

This repository uses [Lerna](https://lerna.js.org/) and [pnpm workspaces](https://pnpm.io/workspaces) for monorepo management.

### Making a Release

To publish a new release:

```bash
git checkout main && git pull && pnpm run publish
```

## Support

- Documentation: [app.meticulous.ai/docs](https://app.meticulous.ai/docs)
- Issues: [GitHub Issues](https://github.com/alwaysmeticulous/meticulous-sdk/issues)