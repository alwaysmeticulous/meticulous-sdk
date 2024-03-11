import { LocalTunnelOptions, Tunnel } from "./lib/tunnel";

export const localtunnel = (options: LocalTunnelOptions): Promise<Tunnel> => {
  const client = new Tunnel(options);
  return new Promise((resolve, reject) =>
    client.open((err) => (err ? reject(err) : resolve(client)))
  );
};
