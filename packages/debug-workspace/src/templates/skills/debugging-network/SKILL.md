---
name: debugging-network
description: Investigate network-related replay failures and divergences. Use when replays fail due to network errors, stubbing issues, or request ordering problems.
---

# Debugging Network Issues

Use this guide when replays fail or diverge due to network request problems.

## Investigation Steps

### 1. Check Logs for Network Errors

- Search `logs.concise.txt` for "network", "fetch", "xhr", "request", "response", "timeout".
- Look for failed requests, unexpected status codes, or missing responses.
- Check for CORS errors or SSL issues.

### 2. Compare Network Activity in Timeline

- In `timeline.json`, look for network-related events.
- Compare the sequence and timing of network requests between head and base.
- Look for requests in one replay that are missing in the other.

### 3. Examine Session Data

- Read session data in `debug-data/sessions/<id>/data.json`.
- Check `recordedRequests` for the original HAR entries captured during recording.
- Compare recorded requests with what was replayed.

### 4. Look for Stubbing Issues

- Network requests are stubbed during replay using recorded data.
- Check if new API endpoints were added that don't have recorded responses.
- Look for requests with dynamic parameters (timestamps, tokens) that may not match stubs.

### 5. Check for Request Ordering Dependencies

- Some applications depend on requests completing in a specific order.
- Look for race conditions where parallel requests resolve differently.
- Check for waterfall dependencies (request B depends on response from request A).

### 6. Verify API Compatibility

- If the API was changed, recorded responses may no longer be valid.
- Check for schema changes, new required fields, or renamed endpoints.
