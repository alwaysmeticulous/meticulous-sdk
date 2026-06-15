---
"@alwaysmeticulous/api": minor
"@alwaysmeticulous/custom-checks": minor
---

Rename the `CustomCheckVerdict` values reported by custom checks: `warn` → `warn-without-requiring-user-ack` and `fail` → `warn-and-require-user-ack` (`pass` is unchanged). The two warning verdicts now make the distinction explicit: `warn-and-require-user-ack` surfaces a report the user is asked to acknowledge (review), while `warn-without-requiring-user-ack` is informational only.
