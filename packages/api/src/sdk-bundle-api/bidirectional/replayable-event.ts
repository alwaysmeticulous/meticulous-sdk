export interface ReplayableEvent {
  selector: string;

  /**
   * e.g. 'click' or 'focus'
   */
  type: string;

  clientX?: number;
  clientY?: number;
  x?: number;
  y?: number;

  /**
   * The time of the event in milliseconds relative to `performance.timeOrigin`. The time taken to start the recorder
   * (time between recorder constructor being called and `Recorder.start()`) has been subtracted off this timestamp.
   *
   * It's therefore close to time elapsed between `Recorder.start()` being called and the user event being triggered
   * (but not exactly, since it doesn't account for the time between `performance.timeOrigin` and the recorder being constructed).
   */
  timeStamp: number;

  /**
   * The absolute time of the event, measured as time in ms since the unix epoch, using the monotonic clock (i.e. same method as `performance.timeOrigin`).
   *
   * Please note that since this timestamp is computed using `performance.timeOrigin` it may differ by multiple hours from timestamps recorded using `Date.now()`.
   */
  timeStampRaw: number;

  /**
   * `false` if the page's own JavaScript dispatched the event. Untrusted markers are not replayed
   * as real input, since the app re-dispatches them itself. Undefined (trusted) on older sessions.
   */
  isTrusted?: boolean;

  /**
   * For pointerdown: the press landed on the target's scrollbar gutter. Replay drops it and its
   * release, since headless overlay scrollbars have no gutter and the press would hit content.
   */
  scrollbarGutterPress?: boolean;

  /**
   * For pointerup: the summed `movementX`/`movementY` of the held moves while the page held pointer
   * lock since the paired press. Under pointer lock the browser freezes `clientX`/`clientY`, so the
   * release is recorded where the press was; replay moves the held button by this offset before
   * releasing. Undefined on older sessions, when the page never held pointer lock with a button
   * down, and when the movement summed to zero.
   */
  pointerLockMovement?: { x: number; y: number };

  /**
   * For paste: the clipboard's plain text, which replay pastes. Apps that insert a paste themselves
   * (rich-text editors) fire no `insertFromPaste` input carrying it. Never recorded for password
   * fields or inside redacted elements. Undefined on older sessions, for untrusted
   * (script-dispatched) pastes, for file pastes (whose plain text is just the file names), when the
   * clipboard held no plain text, and for very large pastes.
   */
  clipboardText?: string;
}
