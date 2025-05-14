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
    callback: (serializedData: string) => void | Promise<void>
  ): void;

  /**
   * Record a custom event. If a mock communication channel is configured,
   * this may trigger custom events to be fired.
   */
  recordCustomEvent(type: string, serializedData: string): { success: boolean };
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
    valueToAppend: string
  ): { success: boolean };

  /**
   * Call this method to record a custom event to replay when replaying this session
   * at the same timestamp as when it was recorde. To listen for these events at replay
   * time see the addCustomEventListener method in the replay API.
   */
  recordCustomEvent(type: string, serializedData: string): { success: boolean };

  /**
   * Provides a link to view the session in the Meticulous UI. This link
   * is of course only accessible by users with access to the Meticulous project.
   */
  getSessionUrl(): string;
}

export interface MeticulousPublicContextApi {
  /**
   * Call this method to record the value of a feature flag. If this method is called multiple times
   * with the same label, the value will be overwritten.
   */
  recordFeatureFlag(
    label: string,
    value: string | boolean
  ): { success: boolean };

  /**
   * Call this method to record some custom context about the session. For instance, you could use
   * this to capture whether a user is opted into beta features, or what colour scheme they have
   * selected in your app. If this method is called multiple times with the same label, the value
   * will be overwritten.
   */
  recordCustomContext(
    label: string,
    value: string | boolean
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
