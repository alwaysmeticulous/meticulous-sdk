import { logNotice } from "@alwaysmeticulous/common";

/**
 * Relays a response's `notes` — free-text caveats about an otherwise-normal
 * answer — to stderr, which is where this CLI puts everything that isn't the
 * result itself, so `--json` stdout stays machine-readable.
 *
 * The backend is the only writer: whether a caveat applies depends on state
 * only it has (how much of a base run's selected set has replayed, say), and
 * keeping a second copy of the wording here is how the two surfaces drift.
 * A response with nothing to remark on omits the field entirely, so this is a
 * no-op for almost every call.
 */
export const logResponseNotes = (response: { notes?: string[] }): void => {
  for (const note of response.notes ?? []) {
    logNotice(note);
  }
};
