export interface PrivateWindowApi {
  __meticulous?: {
    earlyNetworkRecorder?: {
      dispose?: () => Promise<void>;
    };
    stopRecording?: () => void;
  };
}

/**
 * If you add 'https://snippet.meticulous.ai/record/v1/network-recorder.bundle.js' as a script tag
 * then Meticulous will start off by recording any network requests in memory but not send the data to Meticulous’s
 * servers. Once you have the information to determine whether you want to record and persist the session
 * you can then call {@link tryLoadAndStartRecorder} if you do want to record, or this stopIntercepting method
 * if you do not want to record. When you call stopIntercepting any network requests/responses stored in memory
 * will be dropped and Meticulous will be deactivated. No data will be sent to Meticulous's servers.
 *
 * Please note that if you've already started recording and sending data to Meticulous's services i.e.
 * loaded the main meticulous recorder script or called tryLoadAndStartRecorder then this method will
 * not stop the recording. For that you need to call
 */
export const stopIntercepting = async () => {
  const disposeFunction = (window as EarlyNetworkRecorderWindow)?.__meticulous
    ?.earlyNetworkRecorder?.dispose;
  if (disposeFunction) {
    await disposeFunction();
  }
};
