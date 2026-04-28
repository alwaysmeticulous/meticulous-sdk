---
name: debugging-diffs
description: Investigate unexpected visual differences between head and base replays. Use when screenshot diffs are flagged or visual regressions are reported.
---

# Debugging Screenshot Diffs

Use this guide when investigating unexpected visual differences between head and base replays.

## Investigation Steps

### 1. Anchor on `investigationFocus`

- Start with `investigationFocus.primaryScreenshots` from `context.json` (already in
  context). Entries with `isNeighbor: false` are the actually-diffing screenshots and
  carry `mismatchPercent` + `changedSectionsClassNames` inline.
- If `investigationFocus.totalDiffingScreenshots` exceeds the non-neighbour count in
  `primaryScreenshots`, the focus list is truncated to the highest-mismatch 50; consult
  `debug-data/diffs/<id>.summary.json` for the full list.
- Use the focus-scoped `screenshotMap` and `domDiffMap` for paths and metadata. Only
  fall back to `screenshot-index.json` / `dom-diff-index.json` (the unfiltered sidecars)
  if you need a screenshot outside the focus set.

### 2. Understand the Diffs in Detail

- Read `debug-data/diffs/<id>.summary.json` for the compact per-screenshot summary
  (mismatch pixel counts, percentages, changed section class names).
- Only open the full `debug-data/diffs/<id>.json` if you need replay metadata or
  screenshot-assertion config (`screenshotAssertionsOptions`).

### 3. Correlate with Code Changes

- Check `commitSha` in `context.json` to identify the code changes.
- If `project-repo/` is available, use `git log` and `git diff` to see what changed.
- Focus on CSS changes, component rendering logic, and layout modifications.

### 4. Compare Logs at Screenshot Time

- Use `investigationFocus.primaryEventNumbers` and `primaryVtRange` to scope the search.
- Look at events around each focus screenshot's virtual time in head vs base.
- Look for missing or extra events that could cause visual differences.

### 5. Check for Expected vs Unexpected Diffs

- **Expected**: Code changes that intentionally modify the UI (new features, style updates).
- **Unexpected**: Same code producing different visual output, or unrelated areas changing.
- Check if the diff is in a dynamic content area (timestamps, counters, user-specific data).

### 6. Examine Snapshotted Assets

- If `debug-data/replays/{head,base}/<replayId>/snapshotted-assets/` exists, compare JS/CSS between head and base.
- Look for changes in CSS that could cause layout shifts.
- Check for new or modified JavaScript that affects rendering.

### 7. Review Screenshot Assertions Config

- Check `screenshotAssertionsOptions` in the diff JSON for threshold settings.
- Some diffs may be within acceptable tolerance but still flagged.

### 8. Known Meticulous Replay Behaviors (Safe to Approve)

The following patterns are caused by Meticulous replay engine behavior, not by your code changes. When these are the root cause of a diff, the diff is safe to approve.

**Animation flakes**: Continuous animations (Lottie, CSS `@keyframes`, `requestAnimationFrame` loops) can cause screenshots to land at slightly different animation states between base and head, even with no code changes. Meticulous's DOM stability detection triggers extra animation frames trying to reach a stable state, but continuous animations never fully stabilize. **How to confirm**: check `replayComparison` in `context.json` for differing `totalAnimationFrames`; check log diffs for different animation frame counts; search the codebase for `lottie`, `requestAnimationFrame`, CSS `animation`, `@keyframes`, `<canvas>`, `<video>`. If the only visual difference is an animation in a different frame, this diff is safe to approve.

**Network timing differences**: When multiple network responses complete at the same virtual time, slight ordering differences can cause minor rendering variations (e.g. a list rendering in a different order before settling). **How to confirm**: log diffs show network requests completing in a different order at the same virtual time, but the final rendered state is the same or nearly identical. If no code change caused the reordering, this diff is safe to approve.

**Extra DOM stability frames**: The head replay may show more timeline events before a screenshot than the base, caused by DOM stability detection running additional animation frames. If the extra events are all animation-frame-related and the visual diff is minor, this diff is safe to approve.

When any of these patterns is the root cause, tell the user: "This diff is caused by a known Meticulous replay behavior, not by your code changes. It is safe to approve."
