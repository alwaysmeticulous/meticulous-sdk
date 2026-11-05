const LOGIN_GUIDANCE =
  "Run `meticulous auth login` to log in (add `--non-interactive` in a " +
  "terminal without a browser). For CI or other unattended use, set " +
  "METICULOUS_API_TOKEN or pass --apiToken instead.";

/** Explains a 401/403 from the tunnel server, by whether a credential was sent. */
export const buildTunnelAuthFailureMessage = ({
  status,
  sentCredential,
}: {
  status: number | null;
  sentCredential: boolean;
}): string => {
  const prefix =
    status === null
      ? "Authentication failed"
      : `Authentication failed (HTTP ${status})`;
  if (sentCredential) {
    return (
      `${prefix}: the Meticulous credential sent was rejected or lacks ` +
      `access. ${LOGIN_GUIDANCE}`
    );
  }
  return `${prefix}: the request was sent without credentials. ${LOGIN_GUIDANCE}`;
};
