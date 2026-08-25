import type { IncomingMessage, Server, ServerResponse } from "http";
import { createServer } from "http";

const CALLBACK_TIMEOUT_MS = 120_000;

const AGENT_SETUP_SECTION = `    <div style="margin-top: 16px; padding: 20px 24px; max-width: 720px; border: 1px solid #27272a; border-radius: 12px; display: flex; flex-direction: column; gap: 20px; text-align: left;">
      <p style="margin: 0; font-size: 14px; color: #e4e4e7; font-weight: 500;">Using an AI coding agent? Set Meticulous up for it:</p>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <p style="margin: 0; font-size: 13px; color: #a1a1aa;">1. Install the Meticulous CLI:</p>
        <code style="display: block; padding: 10px 14px; background: #27272a; border-radius: 8px; font-size: 13px; color: #e4e4e7; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere;">npm install --global @alwaysmeticulous/cli@latest</code>
        <p style="margin: 6px 0 0; font-size: 13px; color: #a1a1aa;">or, alternatively, add the Meticulous MCP server:</p>
        <code style="display: block; padding: 10px 14px; background: #27272a; border-radius: 8px; font-size: 13px; color: #e4e4e7; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere;">https://app.meticulous.ai/api/mcp</code>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <p style="margin: 0; font-size: 13px; color: #a1a1aa;">2. Either way, install the Meticulous agent skills:</p>
        <code style="display: block; padding: 10px 14px; background: #27272a; border-radius: 8px; font-size: 13px; color: #e4e4e7; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere;">npx skills add alwaysmeticulous/skills --skill "*" --agent claude-code --agent codex --agent cursor -y</code>
      </div>
      <p style="margin: 0; font-size: 13px; color: #a1a1aa;">See the <a href="https://app.meticulous.ai/docs/agents/setup" style="color: #a5b4fc;">agent setup docs</a> for details.</p>
    </div>`;

/**
 * `onboard` installs the CLI, MCP and skills itself, so telling the reader to
 * do all three would contradict the run they are in the middle of. Only the
 * plain `auth login` flow shows that section.
 */
const successHtml = (showAgentSetup: boolean): string => `<!DOCTYPE html>
<html>
<head>
  <title>Meticulous CLI</title>
  <meta charset="utf-8">
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #171719; color: #fff;">
  <div style="text-align: center; display: flex; flex-direction: column; align-items: center; gap: 24px;">
    <img src="https://app.meticulous.ai/meticulous_logo.svg" alt="Meticulous" width="48" height="51" />
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="24" fill="#22c55e"/>
      <path d="M14 24.5L21 31.5L34 18.5" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <h2 style="margin: 0; font-size: 24px; font-weight: 600;">Authentication successful</h2>
    <p style="margin: 0; font-size: 16px; color: #a1a1aa;">You can close this tab and return to the terminal.</p>
${showAgentSetup ? AGENT_SETUP_SECTION : ""}
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

export const startCallbackServer = ({
  showAgentSetup = true,
}: {
  /** Whether the success page should print the agent CLI/MCP/skills steps. */
  showAgentSetup?: boolean;
} = {}): Promise<CallbackServer> => {
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
        res.end(successHtml(showAgentSetup));

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
