import customerAgents from "./customer-agents.json";

/**
 * The subset of the canonical admin-cli onboard agents that is safe to ship to
 * customers. Read from JSON so `scripts/copy-onboard-templates.mjs` can share the
 * same list without duplicating it: the published bundle and the source-mode
 * fallback in materialize-workspace.ts must never disagree about which agents a
 * customer onboarding run is allowed to use.
 */
export const CUSTOMER_AGENT_NAMES: readonly string[] =
  customerAgents.customerAgentNames;
