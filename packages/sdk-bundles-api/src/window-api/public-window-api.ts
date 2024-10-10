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
      }
  );

export interface MeticulousPublicApiCommon {
  isRunningAsTest?: boolean;
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
}
