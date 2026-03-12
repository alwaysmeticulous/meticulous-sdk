---
name: debugging-sessions
description: Investigate problems with recorded session data. Use when session recordings appear incomplete, corrupted, or contain unexpected data.
---

# Debugging Session Data Issues

Use this guide when investigating problems with the recorded session data itself.

## Investigation Steps

### 1. Examine Session Structure

- Read `debug-data/sessions/<id>/data.json` (this can be very large, use grep/search).
- Key fields: `rrwebEvents`, `userEvents`, `recordedRequests`, `applicationStorage`, `webSockets`.

### 2. Check User Events

- `userEvents` contains the sequence of user interactions that will be replayed.
- Verify events are in chronological order.
- Check for truncated or incomplete event sequences.
- Look for unusually rapid event sequences that may indicate automated behavior.

### 3. Verify Network Recordings

- `recordedRequests` contains HAR-format entries of network activity.
- Check for missing responses (the request was recorded but the response wasn't).
- Look for very large responses that might have been truncated.
- Verify content types and encoding are preserved correctly.

### 4. Check Application Storage

- `applicationStorage` captures localStorage, sessionStorage, and cookies.
- Verify that authentication state is properly captured.
- Look for expired tokens or sessions that may cause different behavior during replay.

### 5. Look for Session Quality Issues

- Very short sessions (few events) may not provide meaningful coverage.
- Sessions with `abandoned: true` were not completed normally.
- Check `numberUserEvents` and `numberBytes` for unusually small or large values.

### 6. Verify Recording Environment

- Check session metadata for the recording environment (hostname, URL).
- Ensure the session was recorded against a compatible version of the application.
- Look for environment-specific behavior (staging vs production data).
