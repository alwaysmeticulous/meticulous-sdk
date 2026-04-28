import { describe, expect, it } from "vitest";
import { injectIntoHtml } from "../inject-html";

const SCRIPT = '<script data-recording-token="tok" src="x"></script>';

describe("injectIntoHtml — auto mode", () => {
  it("inserts the script as the first child of <head>", () => {
    const html =
      "<!doctype html><html><head><title>x</title></head><body></body></html>";
    const result = injectIntoHtml(html, SCRIPT, "auto", "data-meticulous");
    expect(result.injected).toBe(true);
    expect(result.warning).toBeUndefined();
    expect(result.html).toBe(
      `<!doctype html><html><head>${SCRIPT}<title>x</title></head><body></body></html>`,
    );
  });

  it("preserves attributes on <head>", () => {
    const html =
      '<html><head lang="en" data-x="1"><title>t</title></head><body></body></html>';
    const result = injectIntoHtml(html, SCRIPT, "auto", "data-meticulous");
    expect(result.injected).toBe(true);
    expect(result.html).toContain(`<head lang="en" data-x="1">${SCRIPT}<title>`);
  });

  it("returns injected=false plus a warning when there is no <head>", () => {
    const html = "<html><body></body></html>";
    const result = injectIntoHtml(html, SCRIPT, "auto", "data-meticulous");
    expect(result.injected).toBe(false);
    expect(result.html).toBe(html);
    expect(result.warning).toMatch(/<head>/i);
  });
});

describe("injectIntoHtml — replace mode", () => {
  it("swaps a placeholder script tag carrying the marker attribute", () => {
    const html =
      "<html><head><script data-meticulous></script><title>t</title></head><body></body></html>";
    const result = injectIntoHtml(html, SCRIPT, "replace", "data-meticulous");
    expect(result.injected).toBe(true);
    expect(result.warning).toBeUndefined();
    expect(result.html).toBe(
      `<html><head>${SCRIPT}<title>t</title></head><body></body></html>`,
    );
  });

  it("matches placeholders carrying additional attributes", () => {
    const html =
      '<html><head><script id="x" data-meticulous async></script></head><body></body></html>';
    const result = injectIntoHtml(html, SCRIPT, "replace", "data-meticulous");
    expect(result.injected).toBe(true);
    expect(result.html).toBe(
      `<html><head>${SCRIPT}</head><body></body></html>`,
    );
  });

  it("matches placeholders case-insensitively", () => {
    const html =
      "<HTML><HEAD><SCRIPT data-meticulous></SCRIPT></HEAD><BODY></BODY></HTML>";
    const result = injectIntoHtml(html, SCRIPT, "replace", "data-meticulous");
    expect(result.injected).toBe(true);
    expect(result.html).toContain(SCRIPT);
    expect(result.html).not.toContain("data-meticulous></SCRIPT>");
  });

  it("does not match a script tag whose attribute name merely starts with the placeholder name", () => {
    // `data-meticulous-recording` starts with `data-meticulous` but is a
    // different attribute; the trailing `-recording` should prevent a match.
    const html =
      "<html><head><script data-meticulous-recording></script></head><body></body></html>";
    const result = injectIntoHtml(html, SCRIPT, "replace", "data-meticulous");
    // Falls back to auto-injection because the placeholder is not found.
    expect(result.warning).toMatch(/Could not find a placeholder.*data-meticulous/);
    expect(result.html).toContain("<script data-meticulous-recording></script>");
    expect(result.html).toContain(SCRIPT);
  });

  it("escapes regex metacharacters in the placeholder attribute name", () => {
    const html =
      "<html><head><script data-foo.bar></script></head><body></body></html>";
    const result = injectIntoHtml(html, SCRIPT, "replace", "data-foo.bar");
    expect(result.injected).toBe(true);
    expect(result.html).toBe(
      `<html><head>${SCRIPT}</head><body></body></html>`,
    );
  });

  it("does not match a different attribute that the regex-escape would otherwise allow", () => {
    // Without proper escaping, `data-foo.bar` would match `data-fooXbar`.
    const html =
      "<html><head><script data-fooXbar></script></head><body></body></html>";
    const result = injectIntoHtml(html, SCRIPT, "replace", "data-foo.bar");
    expect(result.injected).toBe(true);
    // Falls back to auto-injection, so the placeholder is still present.
    expect(result.warning).toMatch(/Could not find a placeholder/);
    expect(result.html).toContain("<script data-fooXbar></script>");
    expect(result.html).toContain(SCRIPT);
  });

  it("falls back to auto with a warning when the placeholder is missing but <head> is present", () => {
    const html = "<html><head><title>t</title></head><body></body></html>";
    const result = injectIntoHtml(html, SCRIPT, "replace", "data-meticulous");
    expect(result.injected).toBe(true);
    expect(result.warning).toMatch(/Could not find a placeholder.*data-meticulous/);
    expect(result.html).toBe(
      `<html><head>${SCRIPT}<title>t</title></head><body></body></html>`,
    );
  });

  it("returns injected=false plus a warning when neither placeholder nor <head> is present", () => {
    const html = "<html><body></body></html>";
    const result = injectIntoHtml(html, SCRIPT, "replace", "data-meticulous");
    expect(result.injected).toBe(false);
    expect(result.html).toBe(html);
    expect(result.warning).toMatch(/Could not find a placeholder/);
    expect(result.warning).toMatch(/<head>/);
  });

  it("treats $ sequences in the script tag as literal characters, not replacement patterns", () => {
    const scriptWithDollar =
      '<script data-recording-token="tok$&amp;" src="https://snippet.meticulous.ai/v1/meticulous.js$\'"></script>';
    const html =
      "<html><head><script data-meticulous></script></head><body></body></html>";
    const result = injectIntoHtml(
      html,
      scriptWithDollar,
      "replace",
      "data-meticulous",
    );
    expect(result.injected).toBe(true);
    expect(result.html).toContain(scriptWithDollar);
  });
});
