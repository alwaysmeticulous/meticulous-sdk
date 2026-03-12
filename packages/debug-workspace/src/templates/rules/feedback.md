# Debugging Feedback

When the developer asks for feedback on the debugging session, or when you have completed
your investigation, provide structured feedback on the experience.

## Feedback Template

### What Worked Well

- Which data sources were most useful for the investigation?
- Which files did you read most and find most informative?
- Were the pre-computed log diffs helpful?

### What Was Missing or Unhelpful

- Was there any data you needed but did not have access to?
- Were any files too large to work with effectively?
- Were there entities or relationships you had to guess about?

### Issues Encountered

- Did you hit any dead ends during investigation?
- Were there any files that were malformed, empty, or confusing?
- Did you struggle with any part of the workspace layout?

### Suggestions for Improvement

- What additional data should be downloaded into the workspace?
- What additional context should be provided in `CLAUDE.md` or `context.json`?
- Would any pre-computed analyses (beyond log diffs) have saved time?
- Are there any debugging patterns you found yourself repeating that could be automated?

### Session Summary

- What was the root cause (or most likely hypothesis)?
- How confident are you in the diagnosis?
- What steps would you recommend to the developer next?
