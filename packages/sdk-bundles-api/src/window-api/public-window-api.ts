/**
 * This API is exposed on the window under `window.Meticulous`.
 */
export type MeticulousPublicApi = MeticulousPublicApiCommon &
  (
    | {
        isRunningAsTest: true;
        replay: MeticulousPublicReplayApi;
      }
    | {
        isRunningAsTest: false;
        record: MeticulousPublicRecordApi;
      }
  );

export interface MeticulousPublicApiCommon {
  isRunningAsTest?: boolean;
  context: MeticulousPublicContextApi;
}

export interface MeticulousPublicReplayApi {
  /**
   * Call this method to pause the Meticulous replay while your code performs an asynchronous operation
   * that Meticulous does not automatically pause for, such as communication with a Chrome extension.
   *
   * See https://app.meticulous.ai/docs/how-to/fix-false-positive-diffs#pausing-meticulous-replays
   */
  pause: () => void;

  /**
   * See https://app.meticulous.ai/docs/how-to/fix-false-positive-diffs#pausing-meticulous-replays
   */
  resume: () => void;

  /**
   * Call this method to terminate the replay.
   */
  terminate: () => void;

  /**
   * Call this method to retrieve custom data that was recorded during the test run.
   */
  retrieveCustomData(key: string): string | null;

  /**
   * Call this method to retrieve an array of custom data that was recorded during the test run.
   */
  retrieveCustomDataArray(arrayId: string): string[];

  /**
   * Call this method to add a listener for a custom event that was recorded during the test run.
   */
  addCustomEventListener(
    type: string,
    callback: (serializedData: string) => void | Promise<void>,
  ): void;

  /**
   * Record a custom event. If a mock communication channel is configured,
   * this may trigger custom events to be fired.
   */
  recordCustomEvent(type: string, serializedData: string): { success: boolean };

  /**
   * True only in case the performance data associated with this replay is
   * significant to benchmark the performance of the application.
   */
  isBenchmarkableReplay: boolean;

  /**
   * Native (non-stubbed) browser APIs that provide real performance metrics.
   * These return actual values and are not affected by virtual time/stubbing.
   * Report these values to analytics platforms only in case
   * isBenchmarkableReplay is true.
   *
   * @example
   * ```
   * // Use native performance.now() only during benchmarkable replays
   * const now = (
   *   window.Meticulous?.replay?.isBenchmarkableReplay
   *     ? window.Meticulous.replay.native
   *     : window
   *   ).performance.now();
   * ```
   *
   * @remarks
   * These APIs bypass Meticulous's deterministic stubbing to provide real
   * performance data for frontend operations.
   *
   * IMPORTANT: During replays, all network traffic to your backend is mocked
   * using previously recorded responses. These performance APIs measure actual
   * browser performance (rendering, JavaScript execution, memory usage) but
   * NOT network or backend performance. Network requests return mocked responses
   * instantly from the recording, so measuring network timing or backend latency
   * with these APIs is not meaningful. Use these APIs to measure frontend
   * performance only.
   *
   * Use to log performance information to analytics dashboards, performance
   * monitors, or custom logging systems.
   * Avoid using these APIs to report performance metrics in the web application
   * UI directly, as this could produce unexpected visual differences.
   * For this use case, use the standard performance APIs available on window.
   *
   * When sending data to an analytics dashboard, ensure that Meticulous
   * allows these requests to pass through.
   * Add the "meticulous-passthrough" header (set to the string "true") to the
   * requests to prevent them from being blocked.
   */
  native: {
    performance: {
      /**
       * Returns the real elapsed time in milliseconds (not virtual time).
       * Uses the native performance.now() that was captured before stubbing.
       *
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Performance/now
       */
      now: typeof window.performance.now;

      /**
       * Returns actual browser memory usage (not the stubbed fixed values).
       *
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory
       */
      memory?: {
        jsHeapSizeLimit: number;
        totalJSHeapSize: number;
        usedJSHeapSize: number;
      };

      /**
       * Measures actual cross-origin memory usage of the page.
       * Uses the native performance.measureUserAgentSpecificMemory() captured before stubbing.
       *
       * @returns A promise that resolves with detailed memory breakdown.
       * Returns `Promise<any>` because this API is experimental and not widely
       * available in all browsers. The return type is not well-defined in
       * TypeScript's standard library definitions.
       *
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory
       */
      measureUserAgentSpecificMemory?: () => Promise<any>;
    };

    /**
     * The native PerformanceObserver API for monitoring real performance metrics.
     * Use this to observe actual performance entries (e.g., navigation,
     * resource, measure) that are not affected by Meticulous's virtual
     * time/stubbing.
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver
     */
    PerformanceObserver: typeof window.PerformanceObserver;
  };

  /**
   * Information about the commit being tested.
   * Only populated during replay when commit context is available.
   */
  commitUnderTest:
    | {
        /**
         * The full commit SHA being test
         */
        sha: string;

        /**
         * The git branch name (e.g., "main", "feature/foo"). Null if not available
         */
        branchName: string | null;

        /**
         * The commit date in ISO 8601 format (e.g., "2025-01-15T10:30:00Z").
         * If the commit date is unknown, this is null.
         */
        date: string | null;
      }
    | undefined;

  /**
   * Information about the session being replayed.
   */
  sessionBeingReplayed: {
    /**
     * The ID of the session being replayed.
     */
    id: string;
  };
}

export interface MeticulousPublicRecordApi {
  /**
   * Call this method to record a single custom data value during the test run.
   * Repeated calls to this method with the same key will overwrite the previous value.
   */
  recordCustomData(key: string, value: string): { success: boolean };

  /**
   * Call this method to push a value to an array of custom data during the test run.
   * If the array does not exist, it will be created.
   * If the array already exists, the value will be appended to it.
   */
  pushToCustomDataArray(
    arrayId: string,
    valueToAppend: string,
  ): { success: boolean };

  /**
   * Call this method to record a custom event to replay when replaying this session
   * at the same timestamp as when it was recorde. To listen for these events at replay
   * time see the addCustomEventListener method in the replay API.
   */
  recordCustomEvent(type: string, serializedData: string): { success: boolean };

  /**
   * Record the initial navigation for this session. This is used to bypass certain types
   * of server-side rendering (SSR) when running Meticulous. It is unlikely you will need
   * to call this method unless you have been directed to do so by Meticulous support.
   */
  recordInitialNavigationResponse(har: InitialNavigationResponse): {
    success: boolean;
  };

  /**
   * Provides a link to view the session in the Meticulous UI. This link
   * is of course only accessible by users with access to the Meticulous project.
   */
  getSessionUrl(): string;

  /**
   * Ensure all data held in memory by the Meticulous recorder has been sent back. If you
   * are recording automated tests, it is recommended to call this at the end of each test
   * and before any full-page navigation.
   */
  flush(): Promise<void>;
}

export interface InitialNavigationResponse {
  /**
   * The status code of the initial navigation response.
   */
  status: number;

  /**
   * The headers of the initial navigation response.
   */
  headers: Record<string, string>;

  /**
   * The body of the initial navigation response.
   */
  body: string;
}

export interface MeticulousPublicContextApi {
  /**
   * Call this method to record the value of a feature flag. If this method is called multiple times
   * with the same label, the value will be overwritten.
   */
  recordFeatureFlag(
    label: string,
    value: string | boolean,
  ): { success: boolean };

  /**
   * Call this method to record some custom context about the session. For instance, you could use
   * this to capture whether a user is opted into beta features, or what colour scheme they have
   * selected in your app. If this method is called multiple times with the same label, the value
   * will be overwritten.
   */
  recordCustomContext(
    label: string,
    value: string | boolean,
  ): { success: boolean };

  /**
   * Record the id of the logged in user (e.g. a user id from a database for the application Meticulous
   * is testing). This is associated with the session and can make it easier to find sessions for a
   * specific user. If this method is called multiple times, the value will be overwritten.
   */
  recordUserId(userId: string): { success: boolean };

  /**
   * Record the email address of the logged in user. This is associated with the session
   * and can make it easier to find sessions for a specific user. If this method is called
   * multiple times, the value will be overwritten.
   */
  recordUserEmail(emailAddress: string): { success: boolean };
}
