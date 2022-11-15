export interface ReplayableEvent {
  selector: string;
  altSelectors?: {
    classesOnly: string;
    traversal: string;
    [key: string]: string;
  };

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
  retries?: number;
}
