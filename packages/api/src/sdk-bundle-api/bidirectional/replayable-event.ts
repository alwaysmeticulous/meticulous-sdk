export interface ReplayableEvent {
  selector: string;
  altSelectors?: {
    /**
     * Selector chain that doesn't use ids e.g. `div:nth-child(4) > div.app-jfa3aaj.main > div.app-container`
     */
    classesOnly: string;

    /**
     * Selector chain that only uses element name and n-th child e.g. `div:nth-child(4) > div:nth-child(1) > div:nth-child(2)`
     */
    traversal: string;
  };

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
}
