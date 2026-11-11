import { createServer, type AddressInfo, type Server } from "net";

/**
 * Asks the OS for `count` distinct free TCP ports on the loopback interface.
 * The OS picks them from its ephemeral range, so two trials (or two recorders)
 * asking at once almost never get the same one, unlike a fixed port list that
 * every concurrent run would share. All are held until every one is picked, so
 * one call never returns a duplicate.
 */
export const findFreePorts = async (count: number): Promise<number[]> => {
  const servers: Server[] = [];
  try {
    for (let i = 0; i < count; i++) {
      servers.push(await listenOnAnyPort());
    }
    return servers.map((server) => (server.address() as AddressInfo).port);
  } finally {
    await Promise.all(servers.map(closeServer));
  }
};

const listenOnAnyPort = (): Promise<Server> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve) => server.close(() => resolve()));
