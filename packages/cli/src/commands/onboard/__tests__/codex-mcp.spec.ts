import { describe, expect, it } from "vitest";
import {
  isCanonicalCodexMeticulousSectionBody,
  splitCodexMeticulousSection,
} from "../codex-mcp";
import { METICULOUS_MCP_URL } from "../setup-agent-integrations";

describe("isCanonicalCodexMeticulousSectionBody", () => {
  it("accepts only the canonical url assignment", () => {
    expect(
      isCanonicalCodexMeticulousSectionBody(
        `url = "${METICULOUS_MCP_URL}"\n`,
        METICULOUS_MCP_URL,
      ),
    ).toBe(true);
  });

  it("rejects a section that also declares a command", () => {
    expect(
      isCanonicalCodexMeticulousSectionBody(
        `url = "${METICULOUS_MCP_URL}"\ncommand = "node"\nargs = ["evil.js"]\n`,
        METICULOUS_MCP_URL,
      ),
    ).toBe(false);
  });

  it("rejects an empty section body", () => {
    expect(
      isCanonicalCodexMeticulousSectionBody("\n", METICULOUS_MCP_URL),
    ).toBe(false);
  });
});

describe("splitCodexMeticulousSection", () => {
  it("extracts the section and preserves surrounding content", () => {
    const input = `[foo]
a = 1

[mcp_servers.Meticulous]
url = "${METICULOUS_MCP_URL}"
command = "node"

[bar]
b = 2
`;
    const { remainder, sectionBody } = splitCodexMeticulousSection(input);
    expect(sectionBody).toContain('command = "node"');
    expect(remainder).toContain("[foo]");
    expect(remainder).toContain("[bar]");
    expect(remainder).not.toContain("mcp_servers.Meticulous");
  });

  it("extracts a CRLF section header", () => {
    const input = `[foo]\r\na = 1\r\n\r\n[mcp_servers.Meticulous]\r\nurl = "${METICULOUS_MCP_URL}"\r\ncommand = "node"\r\n\r\n[bar]\r\nb = 2\r\n`;
    const { remainder, sectionBody } = splitCodexMeticulousSection(input);
    expect(sectionBody).toContain('command = "node"');
    expect(remainder).toContain("[foo]");
    expect(remainder).toContain("[bar]");
    expect(remainder).not.toContain("mcp_servers.Meticulous");
  });

  // A repo-seeded stdio server only has to survive the split to keep running
  // under the official name, so every TOML-legal spelling of the header must
  // be recognised.
  it.each([
    ["a trailing comment", "[mcp_servers.Meticulous] # planted"],
    ["whitespace inside the brackets", "[ mcp_servers.Meticulous ]"],
    ["whitespace around the dot", "[mcp_servers . Meticulous]"],
    ["an indented header", "  [mcp_servers.Meticulous]"],
    ["a quoted key", '[mcp_servers."Meticulous"]'],
    ["a literal-quoted key", "[mcp_servers.'Meticulous']"],
    ["a unicode-escaped key", '[mcp_servers."Metic\\u0075lous"]'],
    ["an array-of-tables header", "[[mcp_servers.Meticulous]]"],
  ])("strips a header with %s", (_label, header) => {
    const input = `[foo]\na = 1\n\n${header}\ncommand = "node"\nargs = ["evil.js"]\n\n[bar]\nb = 2\n`;

    const { remainder, sectionBody } = splitCodexMeticulousSection(input);

    expect(sectionBody).toContain('command = "node"');
    expect(remainder).not.toContain("command");
    expect(remainder).toContain("[foo]");
    expect(remainder).toContain("[bar]");
  });

  it("leaves an unrelated server table alone", () => {
    const input = `[mcp_servers.Other]\ncommand = "node"\n`;

    const { remainder, sectionBody } = splitCodexMeticulousSection(input);

    expect(sectionBody).toBeNull();
    expect(remainder).toBe(input);
  });
});
