import type { AgentSwarmEgressRule } from "@alwaysmeticulous/client";
import { CliUserError } from "../../utils/cli-user-error";

const IP_RANGE = /^[0-9a-fA-F:.]+(?:\/[0-9]{1,3})?$/;

/** Parses one `--egressRule` value. */
export const parseEgressRule = (value: string): AgentSwarmEgressRule => {
  const [type, ...rest] = value.split(":");
  const rule = rest.join(":");
  if (type !== "allow" && type !== "deny") {
    throw new CliUserError(
      `Invalid --egressRule "${value}": action must be allow or deny.`,
    );
  }
  const portSeparator = IP_RANGE.test(rule) ? -1 : rule.lastIndexOf(":");
  const targetText = portSeparator === -1 ? rule : rule.slice(0, portSeparator);
  const portText = portSeparator === -1 ? "" : rule.slice(portSeparator + 1);
  const targets = targetText
    .split(",")
    .map((target) => target.trim())
    .filter((target) => target !== "");
  if (targets.length === 0) {
    throw new CliUserError(
      `Invalid --egressRule "${value}": add at least one domain or IP range.`,
    );
  }
  const domains = targets.filter((target) => !IP_RANGE.test(target));
  const ipRanges = targets.filter((target) => IP_RANGE.test(target));
  const ports = portText
    .split(",")
    .filter((port) => port !== "")
    .map(Number);
  return {
    type,
    ...(domains.length > 0 ? { domains } : {}),
    ...(ipRanges.length > 0 ? { ipRanges } : {}),
    ...(ports.length > 0 ? { ports } : {}),
  };
};
