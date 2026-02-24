import { createServer, IncomingMessage, Server, ServerResponse } from "http";

const CALLBACK_TIMEOUT_MS = 120_000;

const SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Meticulous CLI</title>
  <meta charset="utf-8">
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #171719; color: #fff;">
  <div style="text-align: center; display: flex; flex-direction: column; align-items: center; gap: 24px;">
    <img src="https://app.meticulous.ai/meticulous_logo.svg" alt="Meticulous" width="48" height="51" />
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="24" fill="#1AC590"/>
      <path d="M14 24.5L21 31.5L34 18.5" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <h2 style="margin: 0; font-size: 24px; font-weight: 600;">Authentication successful</h2>
    <p style="margin: 0; font-size: 16px; color: #a1a1aa;">You can close this tab and return to the terminal.</p>
  </div>
</body>
</html>`;

export interface CallbackResult {
  code: string;
  state: string;
}

export interface CallbackServer {
  port: number;
  waitForCallback: () => Promise<CallbackResult>;
}

export const startCallbackServer = (): Promise<CallbackServer> => {
  return new Promise<CallbackServer>((resolveServer, rejectServer) => {
    let callbackResolve: (result: CallbackResult) => void;
    let callbackReject: (error: Error) => void;

    const callbackPromise = new Promise<CallbackResult>((resolve, reject) => {
      callbackResolve = resolve;
      callbackReject = reject;
    });

    const server: Server = createServer(
      (req: IncomingMessage, res: ServerResponse) => {
        if (!req.url?.startsWith("/callback")) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const url = new URL(req.url, `http://127.0.0.1`);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(SUCCESS_HTML);

        if (error) {
          const errorDescription =
            url.searchParams.get("error_description") || error;
          callbackReject(new Error(`OAuth error: ${errorDescription}`));
        } else if (code && state) {
          callbackResolve({ code, state });
        } else {
          callbackReject(new Error("Missing code or state in OAuth callback"));
        }

        server.close();
      },
    );

    const timeout = setTimeout(() => {
      server.close();
      callbackReject(
        new Error(
          `OAuth login timed out after ${CALLBACK_TIMEOUT_MS / 1000} seconds. Please try again.`,
        ),
      );
    }, CALLBACK_TIMEOUT_MS);

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectServer(new Error("Failed to start callback server"));
        return;
      }

      resolveServer({
        port: address.port,
        waitForCallback: async () => {
          try {
            return await callbackPromise;
          } finally {
            clearTimeout(timeout);
          }
        },
      });
    });

    server.on("error", (err) => {
      clearTimeout(timeout);
      rejectServer(err);
    });
  });
};
