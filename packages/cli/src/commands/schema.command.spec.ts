import { describe, expect, test } from "vitest";
import { generateSchema, resolveJsonArgsTarget } from "./schema.command";

interface SchemaNode {
  command: string;
  describe: string;
  aliases?: string[];
  options?: Record<string, { type?: string; deprecated?: unknown }>;
  subcommands?: SchemaNode[];
}

const asNode = (result: ReturnType<typeof generateSchema>): SchemaNode => {
  if (Array.isArray(result)) {
    throw new Error("Expected a single command node, got an array");
  }
  return result as SchemaNode;
};

describe("generateSchema", () => {
  test("top-level list includes the canonical commands without options", () => {
    const result = generateSchema();
    expect(Array.isArray(result)).toBe(true);
    const names = (result as SchemaNode[]).map((n) => n.command);
    expect(names).toEqual(
      expect.arrayContaining(["agent", "auth", "record", "simulate"]),
    );
    // Groups/top-level nodes only expose the name tree, not options.
    for (const node of result as SchemaNode[]) {
      expect(node.options).toBeUndefined();
    }
  });

  test("a leaf command reports global, inherited group, and own options", () => {
    const node = asNode(generateSchema(["agent", "trigger-test-run"]));
    const options = node.options ?? {};
    // Own option.
    expect(options).toHaveProperty("commitSha");
    // Inherited from the agent group builder.
    expect(options).toHaveProperty("verbose");
    expect(options).toHaveProperty("json");
    // Global options attached to the root yargs instance.
    expect(options).toHaveProperty("jsonArgs");
    expect(options).toHaveProperty("dataDir");
    expect(options).toHaveProperty("logLevel");
  });

  test("a leaf command with no builder still reports the global options", () => {
    // Guards against auth logout (which has no builder) dropping its options.
    const node = asNode(generateSchema(["auth", "logout"]));
    const options = node.options ?? {};
    expect(options).toHaveProperty("jsonArgs");
    expect(options).toHaveProperty("dataDir");
    expect(options).toHaveProperty("logLevel");
  });

  test("--dryRun is per-command, not a global option", () => {
    // It used to be accepted on every command; it's now declared only on the
    // commands that act on it. auth logout (no builder) must not advertise it,
    // and .strict() means passing it there is now rejected at runtime.
    const logout = asNode(generateSchema(["auth", "logout"]));
    expect(logout.options).not.toHaveProperty("dryRun");

    // A command that does implement it still reports it.
    const trigger = asNode(generateSchema(["agent", "trigger-test-run"]));
    expect(trigger.options).toHaveProperty("dryRun");
  });

  test("global logLevel keeps its string type in the schema", () => {
    const node = asNode(generateSchema(["auth", "logout"]));
    expect(node.options?.logLevel?.type).toBe("string");
  });

  test("the deprecated --rawJson alias is flagged as deprecated", () => {
    const node = asNode(generateSchema(["auth", "logout"]));
    expect(node.options?.rawJson?.deprecated).toBeTruthy();
  });

  test("resolves a command by its alias", () => {
    // `simulate` is aliased as `replay`.
    const node = asNode(generateSchema(["replay"]));
    expect(node.command).toBe("simulate");
    expect(node.aliases).toContain("replay");
    expect(node.options).toBeDefined();
  });

  test("throws a helpful error for an unknown command", () => {
    expect(() => generateSchema(["not-a-command"])).toThrow(
      /Command not found/,
    );
  });
});

describe("resolveJsonArgsTarget", () => {
  const leafKeys = (path: string[]): Set<string> => {
    const target = resolveJsonArgsTarget(path);
    if (target.kind !== "leaf") {
      throw new Error(
        `Expected a leaf for ${path.join(" ")}, got ${target.kind}`,
      );
    }
    return target.keys;
  };

  test("resolves a leaf command's own + inherited group + global options", () => {
    const keys = leafKeys(["agent", "trigger-test-run"]);
    expect(keys.has("commitSha")).toBe(true); // own
    expect(keys.has("dryRun")).toBe(true); // own
    expect(keys.has("verbose")).toBe(true); // inherited from the agent group
    expect(keys.has("json")).toBe(true); // inherited from the agent group
    expect(keys.has("jsonArgs")).toBe(true); // global
  });

  test("only accepts the invoked command's options, matching .strict()", () => {
    // auth logout does not declare --dryRun, so --jsonArgs must reject it too
    // (it used to slip through when validated against the union of all commands).
    const logout = leafKeys(["auth", "logout"]);
    expect(logout.has("dryRun")).toBe(false);
    expect(logout.has("sessionId")).toBe(false);
    // ...but the global flags are still accepted.
    expect(logout.has("jsonArgs")).toBe(true);
    expect(logout.has("logLevel")).toBe(true);
  });

  test("includes hidden (describe:false) commands' options", () => {
    // `ci start-tunnel` is super-user-gated (describe:false by default), but its
    // flags must still be accepted via --jsonArgs.
    const keys = leafKeys(["ci", "start-tunnel"]);
    expect(keys.has("port")).toBe(true);
    expect(keys.has("host")).toBe(true);
    expect(keys.has("subdomain")).toBe(true);
  });

  test("resolves a command by its alias", () => {
    // `simulate` is aliased as `replay`.
    expect(leafKeys(["replay"]).has("sessionId")).toBe(true);
  });

  test("accepts only canonical option names, not their aliases", () => {
    // Merging --jsonArgs sets exactly the key given and handlers read the
    // canonical name, so an alias key would be silently dropped — it's rejected
    // instead. (start-tunnel's `port`/alias `p`; simulate's `takeSnapshots`/
    // alias `screenshot`.)
    const tunnel = leafKeys(["ci", "start-tunnel"]);
    expect(tunnel.has("port")).toBe(true);
    expect(tunnel.has("p")).toBe(false);
    const simulate = leafKeys(["simulate"]);
    expect(simulate.has("takeSnapshots")).toBe(true);
    expect(simulate.has("screenshot")).toBe(false);
  });

  test("resolves a leaf whose positional/options come from an object builder", () => {
    // debug's subcommands were converted from function to object builders so the
    // walker captures their options and positional (previously classified as an
    // unresolvable command).
    const keys = leafKeys(["debug", "replay-diff"]);
    expect(keys.has("replayDiffId")).toBe(true); // positional
    expect(keys.has("sessionId")).toBe(true); // own option
    expect(keys.has("apiToken")).toBe(true); // shared option
  });

  test("resolves hidden deprecated top-level aliases to their target's options", () => {
    // `run-all-tests-in-cloud` is a hidden alias of `ci run-with-tunnel`,
    // registered outside CLI_COMMANDS. It must resolve to that command's options
    // (not fall back to the permissive union), so --jsonArgs is as strict there.
    const keys = leafKeys(["run-all-tests-in-cloud"]);
    expect(keys.has("appUrl")).toBe(true); // real ci run-with-tunnel option
    expect(keys.has("sessionId")).toBe(false); // not an option there
    expect(keys.has("verbose")).toBe(false); // agent-group-only, not here
  });

  test("accepts a command's positional args as keys (e.g. schema's [command..])", () => {
    // `schema [command..]` exposes the positional on argv as `command`, so
    // `schema --jsonArgs '{"command":[...]}'` must be allowed even though
    // `command` isn't a declared option.
    const keys = leafKeys(["schema"]);
    expect(keys.has("command")).toBe(true);
    expect(keys.has("jsonArgs")).toBe(true); // global still present
  });

  test("classifies a command group (command space) as 'group', not a leaf", () => {
    // --jsonArgs has no single command to apply to on a group, so the caller
    // rejects it rather than validating/merging.
    expect(resolveJsonArgsTarget(["agent"])).toEqual({
      kind: "group",
      name: "agent",
    });
    // A positional under a group stops at the group too.
    expect(resolveJsonArgsTarget(["agent", "not-a-subcommand"])).toEqual({
      kind: "group",
      name: "agent",
    });
  });

  test("classifies an unknown or empty command path as 'unknown' (no keys, caller rejects)", () => {
    expect(resolveJsonArgsTarget(["not-a-command"])).toEqual({
      kind: "unknown",
    });
    expect(resolveJsonArgsTarget([])).toEqual({ kind: "unknown" });
  });

  test("never surfaces a malformed or prototype-polluting key", () => {
    // Exercises the walker across the tricky cases: a group-inheriting leaf,
    // globals-only, a hidden command, a kebab-case option name, and a
    // positional (from an object builder).
    const paths = [
      ["agent", "trigger-test-run"],
      ["auth", "logout"],
      ["ci", "start-tunnel"],
      ["simulate"],
      ["local", "relevant-sessions"],
      ["debug", "replay-diff"],
    ];
    for (const path of paths) {
      for (const key of leafKeys(path)) {
        expect(key).toMatch(/^[a-zA-Z][a-zA-Z0-9-]*$/);
      }
      for (const forbidden of [
        "__proto__",
        "constructor",
        "prototype",
        "_",
        "$0",
      ]) {
        expect(leafKeys(path).has(forbidden)).toBe(false);
      }
    }
  });
});
