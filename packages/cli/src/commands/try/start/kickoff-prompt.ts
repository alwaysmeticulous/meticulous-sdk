const KICKOFF_PROMPT =
  "show me what meticulous (https://meticulous.ai) would have caught on this repository's recent pull requests. " +
  "first read `.claude/CLAUDE.md` and `try-context.json` in this workspace — they define the five phases, " +
  "the skills to follow for each (`.claude/skills/`), the `pr-backtester` and `session-recorder` subagents, " +
  "and the `meticulous try …` helper commands. the repository itself is the added directory " +
  "(`projectRoot` in try-context.json). work through the phases in order: " +
  "(1) build and serve the app locally and save the build recipe — if the app already has meticulous installed " +
  "(recorder snippet or package), disable it in every build so this trial tests meticulous from scratch; " +
  "if the app or the pages that matter need a login, follow the `try-app-login` skill: pick the mechanism, " +
  "pause and ask me once (usually to log in with a test account in a browser `meticulous try login` opens), " +
  "and reuse that login in every recording; " +
  "(2) record 15–30 sessions covering the app's main routes and flows, then wait for ingestion; " +
  "(3) check that the recorded sessions replay cleanly against a build of the app, and if they do not, " +
  "change the build or the app until they do, saving any code change with `meticulous try replay-fix save` " +
  "so every backtest applies it to both its base and head; " +
  "(4) pick `prCount` recently merged prs with `meticulous try candidate-prs` and backtest every one of them " +
  "in parallel — one `pr-backtester` subagent per pr, all launched in a single message, in the background when you can; " +
  "(5) post early findings as soon as the first prs finish, then report the results, leading with the most compelling findings. " +
  "never commit, push, switch branches or edit tracked files in the repository: everything you create lives " +
  "under `.meticulous-try/`. METICULOUS_API_TOKEN is already set for the trial project — never print it. " +
  "other trials may be running on this machine at the same time: run `meticulous try preflight` before anything else, " +
  "and use `meticulous try free-port` and the trial's `dockerPrefix` instead of fixed ports and container names.";

const HEADLESS_SUFFIX =
  " this run is non-interactive: never wait for an answer. if you are truly blocked (secrets or test " +
  "credentials you cannot find, or a login only the user can complete — do not run `meticulous try login`), write what you need to `.meticulous-try/needs-input.md`, continue with " +
  "whatever still works, and say so in the final report.";

export const defaultTryPrompt = (options: { headless: boolean }): string =>
  options.headless ? `${KICKOFF_PROMPT}${HEADLESS_SUFFIX}` : KICKOFF_PROMPT;
