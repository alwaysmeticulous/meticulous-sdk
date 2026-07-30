import { describe, expect, it } from "vitest";
import {
  classifyDevCommand,
  extractPassthroughCommand,
  injectSidecarVar,
} from "../backend-dev-command.utils";

describe("extractPassthroughCommand", () => {
  it("returns tokens after the first standalone --", () => {
    expect(
      extractPassthroughCommand([
        "/usr/bin/node",
        "/cli/main.js",
        "record",
        "backend",
        "--port",
        "0",
        "--",
        "npx",
        "wrangler",
        "dev",
        "--port",
        "8787",
      ]),
    ).toEqual(["npx", "wrangler", "dev", "--port", "8787"]);
  });

  it("returns null without a separator or with nothing after it", () => {
    expect(
      extractPassthroughCommand(["node", "main.js", "record", "backend"]),
    ).toBeNull();
    expect(
      extractPassthroughCommand(["node", "main.js", "record", "backend", "--"]),
    ).toBeNull();
  });

  it("only splits on the first separator", () => {
    expect(
      extractPassthroughCommand(["node", "main.js", "--", "cmd", "--", "arg"]),
    ).toEqual(["cmd", "--", "arg"]);
  });
});

describe("classifyDevCommand", () => {
  it.each([
    [["wrangler", "dev"]],
    [["npx", "wrangler", "dev"]],
    [["npx", "-y", "wrangler", "dev"]],
    [["pnpm", "wrangler", "dev"]],
    [["pnpm", "exec", "wrangler", "dev"]],
    [["pnpm", "dlx", "wrangler", "dev"]],
    [["yarn", "wrangler", "dev"]],
    [["bunx", "wrangler", "dev"]],
    [["./node_modules/.bin/wrangler", "dev"]],
    [["wrangler", "dev", "--port", "8787"]],
  ])("recognizes %j as wrangler dev", (tokens) => {
    expect(classifyDevCommand(tokens)).toBe("wrangler-dev");
  });

  it.each([
    [["wrangler", "pages", "dev"]],
    [["npx", "wrangler", "pages", "dev", "./dist"]],
  ])("recognizes %j as wrangler pages dev", (tokens) => {
    expect(classifyDevCommand(tokens)).toBe("wrangler-pages-dev");
  });

  it.each([
    [["npm", "run", "dev"]],
    [["pnpm", "run", "dev"]],
    [["node", "server.js"]],
    [["wrangler", "deploy"]],
    [["wrangler"]],
    [[]],
    [["yarn", "dev"]],
  ])("classifies %j as unknown", (tokens) => {
    expect(classifyDevCommand(tokens)).toBe("unknown");
  });
});

describe("injectSidecarVar", () => {
  const url = "http://127.0.0.1:9670";

  it("appends --var for wrangler dev", () => {
    expect(
      injectSidecarVar(["npx", "wrangler", "dev"], "wrangler-dev", url),
    ).toEqual([
      "npx",
      "wrangler",
      "dev",
      "--var",
      `METICULOUS_SIDECAR_URL:${url}`,
    ]);
  });

  it("appends --binding for wrangler pages dev", () => {
    expect(
      injectSidecarVar(["wrangler", "pages", "dev"], "wrangler-pages-dev", url),
    ).toEqual([
      "wrangler",
      "pages",
      "dev",
      "--binding",
      `METICULOUS_SIDECAR_URL=${url}`,
    ]);
  });

  it("leaves unknown commands untouched", () => {
    expect(injectSidecarVar(["npm", "run", "dev"], "unknown", url)).toEqual([
      "npm",
      "run",
      "dev",
    ]);
  });
});
