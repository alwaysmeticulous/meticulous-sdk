---
name: debugging-flakes
description: Investigate flaky or non-deterministic replay behavior. Use when replays produce different results across runs of the same session against the same code.
---

# Debugging Flaky Replays

A flaky replay is one that produces different results (screenshots, logs, behavior) across
multiple runs of the same session against the same code. Use this guide when investigating
non-deterministic behavior.

## Investigation Steps

### 1. Compare Deterministic Logs

- Diff `logs.deterministic.txt` between the head and base replays.
- Look for the first point of divergence -- this is usually where the flake originates.
- Pay attention to event execution order differences.

### 2. Check Timeline for Timing Issues

- Read `timeline.json` and look for events with significantly different virtual timestamps.
- Look for race conditions: events that depend on network responses or animations completing.
- Check for `setTimeout`/`setInterval` patterns that may resolve differently.

### 3. Analyze Accuracy Data

- Read `accuracyData.json` for the replay's self-assessment of accuracy.
- Low accuracy scores often correlate with flakiness.
- Check which specific checks failed.

### 4. Look for Common Flake Patterns

- **Animation timing**: CSS transitions or JS animations that haven't completed when screenshot is taken.
- **Network race conditions**: API responses arriving in different order.
- **Date/time dependencies**: Code that uses `Date.now()` or renders timestamps.
- **Random values**: Code using `Math.random()` that wasn't properly seeded.
- **Lazy loading**: Content loaded on intersection observer timing.
- **Font loading**: Web fonts loading at different times causing layout shifts.

When any of these patterns is identified as the root cause and no user code change is involved, the resulting diff is caused by non-determinism in the replay environment, not the user's code. Advise the user that these diffs are **safe to approve**.

### 5. Check Replay Parameters

- Compare `launchBrowserAndReplayParams.json` between runs.
- Verify viewport size, user agent, and other environment settings match.
- Check if network stubbing configuration is consistent.

### 6. Examine Stack Traces

- Read `stackTraces.json` for any errors thrown during replay.
- Errors that occur in some runs but not others are strong flake indicators.
