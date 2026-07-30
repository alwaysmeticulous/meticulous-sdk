import { rm } from "fs/promises";
import * as net from "net";
import * as os from "os";
import * as path from "path";
import { describe, expect, it, vi } from "vitest";
import { CliUserError } from "../../../utils/cli-user-error";
import {
  resolveSidecarPort,
  type SidecarHandle,
  startSidecar,
} from "../backend-sidecar.utils";

const FAKE_SIDECAR = path.join(__dirname, "fixtures", "fake-sidecar.cjs");
const BROKEN_SIDECAR = path.join(__dirname, "fixtures", "broken-sidecar.cjs");
const FLAKY_SIDECAR = path.join(__dirname, "fixtures", "flaky-sidecar.cjs");

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const findFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = (probe.address() as net.AddressInfo).port;
      probe.close(() => resolve(port));
    });
  });

const occupyPort = (): Promise<{ port: number; release: () => void }> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({ port, release: () => server.close() });
    });
  });

const health = async (
  url: string,
): Promise<{ ok: boolean; pid: number; flushCount: number }> => {
  const response = await fetch(`${url}/v1/health`);
  return (await response.json()) as {
    ok: boolean;
    pid: number;
    flushCount: number;
  };
};

const waitFor = async <T>(
  probe: () => Promise<T | undefined>,
  timeoutMs: number,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await probe().catch(() => undefined);
    if (result !== undefined) {
      return result;
    }
    await sleep(100);
  }
  throw new Error("Timed out waiting for condition");
};

describe("resolveSidecarPort", () => {
  it("returns the requested port when free", async () => {
    const port = await findFreePort();
    await expect(resolveSidecarPort(port, "sidecar-only")).resolves.toBe(port);
  });

  it("picks an ephemeral port for 0", async () => {
    const port = await resolveSidecarPort(0, "wrapped");
    expect(port).toBeGreaterThan(0);
  });

  it("falls back to an ephemeral port in wrapped mode when busy", async () => {
    const { port, release } = await occupyPort();
    try {
      const resolved = await resolveSidecarPort(port, "wrapped");
      expect(resolved).not.toBe(port);
      expect(resolved).toBeGreaterThan(0);
    } finally {
      release();
    }
  });

  it("errors in sidecar-only mode when busy", async () => {
    const { port, release } = await occupyPort();
    try {
      await expect(resolveSidecarPort(port, "sidecar-only")).rejects.toThrow(
        CliUserError,
      );
    } finally {
      release();
    }
  });
});

describe("startSidecar", () => {
  const startFake = async (
    options: {
      onRecordingStopped?: () => void;
    } = {},
  ): Promise<SidecarHandle> => {
    const port = await findFreePort();
    return startSidecar({
      bundlePath: FAKE_SIDECAR,
      port,
      env: {},
      ...options,
    });
  };

  it("starts, reports healthy, flushes, and stops", async () => {
    const sidecar = await startFake();
    try {
      expect((await health(sidecar.url)).ok).toBe(true);
      await sidecar.flush();
      expect((await health(sidecar.url)).flushCount).toBe(1);
    } finally {
      await sidecar.stop();
    }
    await expect(health(sidecar.url)).rejects.toThrow();
  });

  it("restarts once on the same port after an unexpected exit", async () => {
    const onRecordingStopped = vi.fn();
    const sidecar = await startFake({ onRecordingStopped });
    try {
      const originalPid = (await health(sidecar.url)).pid;
      await fetch(`${sidecar.url}/die`, { method: "POST" });

      const restartedPid = await waitFor(async () => {
        const current = await health(sidecar.url);
        return current.pid !== originalPid ? current.pid : undefined;
      }, 20_000);
      expect(restartedPid).not.toBe(originalPid);
      expect(onRecordingStopped).not.toHaveBeenCalled();

      // A second death exhausts the single restart.
      await fetch(`${sidecar.url}/die`, { method: "POST" });
      await waitFor(
        () =>
          Promise.resolve(
            onRecordingStopped.mock.calls.length > 0 ? true : undefined,
          ),
        20_000,
      );
    } finally {
      await sidecar.stop();
    }
  }, 45_000);

  it("fails with the sidecar's stderr when startup fails", async () => {
    const port = await findFreePort();
    await expect(
      startSidecar({ bundlePath: BROKEN_SIDECAR, port, env: {} }),
    ).rejects.toThrow(/refusing to start/);
  });

  it("does not restart a sidecar that dies during startup", async () => {
    const port = await findFreePort();
    const marker = path.join(os.tmpdir(), `flaky-sidecar-${port}.marker`);
    await rm(marker, { force: true });
    try {
      await expect(
        startSidecar({
          bundlePath: FLAKY_SIDECAR,
          port,
          env: { METICULOUS_TEST_FLAKY_MARKER: marker },
        }),
      ).rejects.toThrow(/exited during startup/);

      // A startup failure must not trigger the crash-restart supervision: a
      // successful background restart would outlive the failed CLI run with
      // no handle to stop it, holding the port.
      await sleep(1_500);
      const orphanHealth = await fetch(
        `http://127.0.0.1:${port}/v1/health`,
      ).catch(() => undefined);
      if (orphanHealth) {
        // Kill the orphan so a regression doesn't leak a process, then fail.
        await fetch(`http://127.0.0.1:${port}/die`, { method: "POST" }).catch(
          () => undefined,
        );
      }
      expect(orphanHealth).toBeUndefined();
    } finally {
      await rm(marker, { force: true });
    }
  }, 20_000);
});
