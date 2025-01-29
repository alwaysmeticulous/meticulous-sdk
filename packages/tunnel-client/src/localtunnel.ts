import { Tunnel } from "./lib/tunnel";
import { LocalTunnelOptions } from "./types";

export const localtunnel = (options: LocalTunnelOptions): Promise<Tunnel> => {
  // Per https://bun.sh/guides/util/detect-bun this detects if the runtime is Bun
  if (process.versions.bun) {
    return new Promise((_, reject) => {
      reject(new Error("Opening a tunnel is unsupported in the Bun runtime!"));
    });
  }
  const client = new Tunnel(options);
  return new Promise((resolve, reject) =>
    client.open((err) => (err ? reject(err) : resolve(client)))
  );
};
