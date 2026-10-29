import type * as Undici from "undici";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meticulousFetch } from "../fetch.utils";

const { undiciFetch } = vi.hoisted(() => ({ undiciFetch: vi.fn() }));

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof Undici>();
  return { ...actual, fetch: (...args: unknown[]) => undiciFetch(...args) };
});

const dispatcherOfLastCall = (): unknown => {
  const init = undiciFetch.mock.calls.at(-1)?.[1] as { dispatcher?: unknown };
  return init.dispatcher;
};

describe("meticulousFetch", () => {
  afterEach(() => {
    undiciFetch.mockReset();
  });

  it("uses the caller's dispatcher when given one", async () => {
    const dispatcher = { kind: "pinned" } as never;

    await meticulousFetch("http://example.test/api", { dispatcher });

    expect(dispatcherOfLastCall()).toBe(dispatcher);
  });

  it("falls back to the shared dispatcher otherwise", async () => {
    await meticulousFetch("http://example.test/api");
    const first = dispatcherOfLastCall();
    await meticulousFetch("http://example.test/other");

    expect(first).toBeDefined();
    expect(dispatcherOfLastCall()).toBe(first);
  });
});
