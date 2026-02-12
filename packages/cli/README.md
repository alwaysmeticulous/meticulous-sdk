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

### Recording

| Command | Description |
|---------|-------------|
| `record` | Record a new session by interacting with your app |
| `record-login` | Record a login flow session |

### Replay & Testing

| Command | Description |
|---------|-------------|
| `simulate` / `replay` | Replay a recorded session locally |
| `run-all-tests` | Run all replay test cases locally |
| `run-all-tests-in-cloud` | Run tests in Meticulous cloud infrastructure |

### Download & Analysis

| Command | Description |
|---------|-------------|
| `download-replay` | Download replay data and logs for analysis |
| `download-session` | Download recorded session data |
| `download-test-run` | Download test run results |

### Utilities

| Command | Description |
|---------|-------------|
| `show-project` | Display project info linked with API token |
| `start-local-tunnel` | Start a local tunnel for cloud tests |
| `prepare-for-meticulous-tests` | Prepare for test execution in CI |

---

## Debugging Replays

### Step-Through Debugger

The CLI includes an interactive debugger for stepping through replay events:

```bash
npx @alwaysmeticulous/cli simulate \
  --sessionId="<SESSION_ID>" \
  --appUrl="http://localhost:3000" \
  --debugger
```

**Debugger Options:**

| Option | Description |
|--------|-------------|
| `--debugger` | Enable the step-through debugger UI |
| `--startAtEvent=N` | Auto-advance to event N when debugger starts |
| `--devTools` | Open Chrome DevTools alongside the debugger |

### Download Replay Logs

Download and analyze replay data:

```bash
npx @alwaysmeticulous/cli download-replay --replayId="<REPLAY_ID>"
```

This generates:
- `logs.ndjson` - Raw logs
- `logs.concise.txt` - Human-readable logs
- `logs.deterministic.txt` - Logs for diffing (non-deterministic values removed)

### Flake Detection

Detect flaky tests by running multiple times:

```bash
npx @alwaysmeticulous/cli run-all-tests \
  --appUrl="http://localhost:3000" \
  --maxRetriesOnFailure=3 \
  --rerunTestsNTimes=5
```

| Option | Description |
|--------|-------------|
| `--maxRetriesOnFailure` | Re-run tests with visual diffs; mark as flake if different on retry |
| `--rerunTestsNTimes` | Re-run ALL tests N times; mark as flake if snapshots differ |

### Network Debugging

Debug network request matching and transformations:

```bash
npx @alwaysmeticulous/cli simulate \
  --sessionId="<SESSION_ID>" \
  --appUrl="http://localhost:3000" \
  --networkDebuggingRequestRegexes="api/.*" \
  --networkDebuggingRequestTypes="original-recorded-request" "request-to-match"
```

| Option | Description |
|--------|-------------|
| `--networkDebuggingRequestRegexes` | Filter requests by URL pattern |
| `--networkDebuggingTransformationFns` | Log specific transformations |
| `--networkDebuggingRequestTypes` | Types: `original-recorded-request`, `request-to-match` |
| `--networkDebuggingWebsocketUrlRegexes` | Monitor WebSocket traffic |

---

## Common Replay Options

These options are available on `simulate`, `run-all-tests`, and related commands:

### Browser Control

| Option | Default | Description |
|--------|---------|-------------|
| `--headless` | false | Run browser in headless mode |
| `--devTools` | false | Open Chrome DevTools |
| `--bypassCSP` | false | Bypass Content Security Policy |
| `--noSandbox` | false | Disable Chromium sandbox |

### Replay Behavior

| Option | Default | Description |
|--------|---------|-------------|
| `--shiftTime` | - | Shift time to recording time |
| `--networkStubbing` | - | Stub network requests |
| `--skipPauses` | - | Fast-forward through pauses |
| `--moveBeforeMouseEvent` | - | Simulate mouse movement |
| `--maxDurationMs` | - | Max replay duration in milliseconds |
| `--maxEventCount` | - | Max number of events to replay |

### Screenshots & Visual Comparison

| Option | Default | Description |
|--------|---------|-------------|
| `--takeSnapshots` / `--screenshot` | - | Capture final screenshot |
| `--storyboard` | - | Capture screenshots during replay |
| `--diffThreshold` | - | Max proportion of changed pixels (0-1) |
| `--diffPixelThreshold` | - | Per-pixel color difference threshold (0-1) |
| `--baseReplayId` | - | Replay to compare against |

### Logging

| Option | Default | Description |
|--------|---------|-------------|
| `--logLevel` | info | Log level: trace/debug/info/warn/error/silent |
| `--logPossibleNonDeterminism` | - | Enable non-determinism logging |

---

## Configuration

The CLI can be configured using command-line flags or environment variables:

- `--apiToken` / `METICULOUS_API_TOKEN` - Your Meticulous API token
- `--appUrl` / `METICULOUS_APP_URL` - URL where your app is running
- `--sessionId` - Specific session ID to replay (for `simulate` command)
- `--dataDir` - Directory for local data storage (default: `~/.meticulous`)

### Config File

Store your API token in `~/.meticulous/config.json`:

```json
{
  "apiToken": "your-api-token"
}
```

---

## Environment Variables for Debugging

Set these environment variables for advanced debugging:

| Variable | Description |
|----------|-------------|
| `METICULOUS_HOLD_BROWSER_OPEN` | Keep browser open after replay |
| `METICULOUS_NO_TIMEOUT` | Disable timeouts for debugging |
| `METICULOUS_TRACK_UNEXPECTED_EXECUTION` | Track unexpected code execution |
| `METICULOUS_DEBUG_DOM_UPDATES` | Log DOM mutations |
| `METICULOUS_LOG_CDP_MESSAGES` | Log Chrome DevTools Protocol messages |
| `METICULOUS_SHOW_MOUSE_LOCATION` | Show mouse position with red dot |

### Example: Debug a Flaky Replay

```bash
METICULOUS_HOLD_BROWSER_OPEN=true \
METICULOUS_TRACK_UNEXPECTED_EXECUTION=true \
npx @alwaysmeticulous/cli simulate \
  --sessionId="<SESSION_ID>" \
  --appUrl="http://localhost:3000" \
  --debugger \
  --devTools
```

---

## Documentation

- [Full Documentation](https://app.meticulous.ai/docs)
- [Onboarding Guide](https://app.meticulous.ai/docs/onboarding-guide)
- [GitHub Repository](https://github.com/alwaysmeticulous/meticulous-sdk)

## Requirements

- Node.js >= 12

## Support

- Documentation: [app.meticulous.ai/docs](https://app.meticulous.ai/docs)
- Issues: [GitHub Issues](https://github.com/alwaysmeticulous/meticulous-sdk/issues)
