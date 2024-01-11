import { Page } from "puppeteer";

/**
 * Injects an iframe that allows the user to finish recording.
 */
export const injectFinishRecordingFrame = async (
  page: Page,
  callbackFnName: string
): Promise<void> => {
  // Check that callbackFnName is a valid function name
  const typeCheck = await page.evaluate(`typeof window["${callbackFnName}"]`);
  if (typeCheck !== "function") {
    throw new Error("Finish recording callback fn not ready in browser");
  }

  page.on("framenavigated", async (frame) => {
    try {
      if (page.mainFrame() !== frame) {
        return;
      }

      await frame.evaluate((callbackFnName) => {
        window.addEventListener("load", () => {
          const hasFinishRecordingIframe = !!document.getElementById(
            "__meticulous__finish_recording_iframe"
          );

          if (hasFinishRecordingIframe) {
            return;
          }

          const iframe = document.createElement("iframe");
          iframe.style.position = "fixed";
          iframe.style.bottom = "25px";
          iframe.style.right = "25px";
          iframe.style.width = "150px";
          iframe.style.height = "50px";
          iframe.style.border = "0";
          iframe.style.borderRadius = "5px";
          iframe.style.zIndex = (Math.pow(2, 31) - 1).toString();
          iframe.id = "__meticulous__finish_recording_iframe";
          document.body.appendChild(iframe);

          const iframeDoc = iframe.contentDocument;
          if (!iframeDoc) {
            throw new Error(
              "iframe document not found, this should not happen"
            );
          }
          iframeDoc.open();
          iframeDoc.write(`
          <html>
            <head>
              <style>
                  body {
                    margin: 0;
                    background-color: transparent;
                    font-family: Noto Sans, sans-serif;
                  }
                  #finish-recording {
                    width: 100%;
                    height: 100%;
                    border: 0;
                    background-color: #e39670;
                    cursor: pointer;
                  }
                  #finish-recording:hover {
                    background-color: #e9ab8b;

                  }
              </style>
              <script>
                const finishRecording = () => {
                  window["${callbackFnName}"]?.();
                };
              </script>
            </head>
            <body style="margin: 0; background-color: transparent;">
              <button id="finish-recording" onclick="finishRecording()">Finish Recording</button>
            </body>
          </html>
        `);
          iframeDoc.close();
        });
      }, callbackFnName);
    } catch (err) {
      console.error(err);
    }
  });
};
