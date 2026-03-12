---
name: debugging-timelines
description: Investigate timeline divergence between head and base replays. Use when event sequences, ordering, or timing differ unexpectedly.
---

# Debugging Timeline Divergence

Use this guide when replay timelines differ unexpectedly between head and base runs.

## Investigation Steps

### 1. Load and Compare Timelines

- Read `timeline.json` from both head and base replay directories.
- The timeline is an array of events with timestamps, types, and data.
- Look for the first event where the timelines diverge.

### 2. Understand Event Types

Key timeline event types:

- **user-event**: User interactions (click, type, scroll, hover).
- **network-request**: API calls and responses.
- **screenshot**: Screenshot capture points.
- **mutation**: DOM mutations observed during replay.
- **navigation**: Page navigation events.
- **error**: JavaScript errors.
- **console**: Console log messages.

### 3. Identify Divergence Patterns

- **Missing events**: Events in base that don't appear in head (or vice versa).
- **Reordered events**: Same events but in different sequence.
- **Timing shifts**: Events at significantly different virtual timestamps.
- **Extra events**: New events not present in the baseline.

### 4. Check Timeline Stats

- Read `timeline-stats.json` for aggregated statistics.
- Compare event counts, durations, and error counts between replays.

### 5. Trace Back to Root Cause

- Once you find the divergence point, look at what happened immediately before.
- Check if a user event triggered different behavior.
- Look for conditional logic in the application that might execute differently.

### 6. Cross-Reference with Logs

- Use timestamps from the timeline divergence to find corresponding log entries.
- Check `logs.deterministic.txt` at the same virtual time for additional context.
