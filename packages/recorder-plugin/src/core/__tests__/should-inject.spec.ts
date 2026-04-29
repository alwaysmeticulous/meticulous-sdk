import { describe, expect, it, vi } from "vitest";
import type { EnabledContext } from "../../types";
import { shouldInject } from "../should-inject";

const prodCtx: EnabledContext = {
  framework: "vite",
  isProduction: true,
  mode: "production",
  command: "build",
};
const devCtx: EnabledContext = {
  framework: "vite",
  isProduction: false,
  mode: "development",
  command: "serve",
};

describe("shouldInject", () => {
  it("returns true for `always` regardless of production status", () => {
    expect(shouldInject("always", prodCtx)).toBe(true);
    expect(shouldInject("always", devCtx)).toBe(true);
  });

  it("returns false for `never`", () => {
    expect(shouldInject("never", prodCtx)).toBe(false);
    expect(shouldInject("never", devCtx)).toBe(false);
  });

  it("returns true in dev and false in prod for `development`", () => {
    expect(shouldInject("development", devCtx)).toBe(true);
    expect(shouldInject("development", prodCtx)).toBe(false);
  });

  it("invokes a function predicate with the context", () => {
    const predicate = vi.fn().mockReturnValue(true);
    expect(shouldInject(predicate, prodCtx)).toBe(true);
    expect(predicate).toHaveBeenCalledWith(prodCtx);
  });

  it("only treats strict `true` as truthy from a function predicate", () => {
    expect(shouldInject(() => false, devCtx)).toBe(false);
    // Non-boolean truthy values must not enable injection.
    expect(shouldInject((() => "yes" as unknown as boolean), devCtx)).toBe(
      false,
    );
    expect(shouldInject(() => true, devCtx)).toBe(true);
  });
});
