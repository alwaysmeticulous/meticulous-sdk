## Keep `meticulous try`'s playbook current

The `meticulous try` agent templates (`public_packages/cli/src/commands/try/templates/`) and `try/__docs__/README.md` spell out exact flags of `agent upload-build`, `agent trigger-test-run`, `agent test-run-diffs`, `agent agent-swarm-run(s|-case)`, `ci agent-test` and `crawl`. If a change renames, removes or changes the meaning of one of those flags or their `--json` output, check the templates and the doc.
