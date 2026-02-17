# Meticulous CLI

[![npm version](https://img.shields.io/npm/v/@alwaysmeticulous/cli.svg)](https://www.npmjs.com/package/@alwaysmeticulous/cli)
[![npm downloads](https://img.shields.io/npm/dm/@alwaysmeticulous/cli.svg)](https://www.npmjs.com/package/@alwaysmeticulous/cli)
[![License: ISC](https://img.shields.io/npm/l/@alwaysmeticulous/cli.svg)](https://github.com/alwaysmeticulous/meticulous-sdk/blob/main/LICENSE)
[![Node.js Version](https://img.shields.io/node/v/@alwaysmeticulous/cli.svg)](https://nodejs.org)

The official command-line interface for [Meticulous](https://meticulous.ai) - automated end-to-end testing that eliminates test maintenance. See the [documentation](https://app.meticulous.ai/docs) for more details.

## What is Meticulous?

Meticulous automatically creates and maintains a comprehensive test suite for your web application by recording real user interactions. When you open a pull request, Meticulous replays these user sessions against both the old and new versions of your app, identifying visual and functional differences.

**Key Benefits:**

- Zero maintenance tests that evolve with your app
- Scale to thousands of tests without writing code
- Catch regressions before they reach production
- Test real user flows, not assumptions

## Installation

```bash
npm install --save-dev @alwaysmeticulous/cli
```

## Quick Start

Sessions are recordings of user interactions with your application that Meticulous can replay to test for regressions.

### 1. Record a Session

Record a new session by interacting with your application:

```bash
npx @alwaysmeticulous/cli record \
  --apiToken="<API_TOKEN>" \
  --appUrl="http://localhost:3000"
```

> **Note:** `--apiToken` is only required if the token is not stored in `~/.meticulous/config.json`.

### 2. Simulate a Session

Simulate a recorded session on your local environment:

```bash
npx @alwaysmeticulous/cli simulate \
  --apiToken="<API_TOKEN>" \
  --sessionId="<SESSION_ID>" \
  --appUrl="http://localhost:3000"
```

### 3. Run in CI

Add Meticulous to your CI pipeline to automatically test every pull request. See the [documentation](https://app.meticulous.ai/docs) for detailed CI setup instructions.

## CLI Commands

Run `npx @alwaysmeticulous/cli --help` to see all available commands.

Common commands:

- `record` - Record a new session
- `simulate` - Simulate a recorded session locally
- `run-all-tests` - Run all replay test cases
- Additional commands available via `--help`

## Configuration

The CLI can be configured using command-line flags or environment variables:

- `--apiToken` / `METICULOUS_API_TOKEN` - Your Meticulous API token
- `--appUrl` / `METICULOUS_APP_URL` - URL where your app is running
- `--sessionId` - Specific session ID to replay (for `simulate` command)

## Documentation

- [Full Documentation](https://app.meticulous.ai/docs)
- [Onboarding Guide](https://app.meticulous.ai/docs/onboarding-guide)
- [GitHub Repository](https://github.com/alwaysmeticulous/meticulous-sdk)

## Requirements

- Node.js >= 12

## Support

- Documentation: [app.meticulous.ai/docs](https://app.meticulous.ai/docs)
- Issues: [GitHub Issues](https://github.com/alwaysmeticulous/meticulous-sdk/issues)
