## Keep `meticulous try`'s playbook current

The `meticulous try` agent templates (`public_packages/cli/src/commands/try/templates/`) and `try/__docs__/README.md` spell out exact flags of `agent upload-build`, `agent trigger-test-run`, `agent test-run-diffs`, `agent agent-swarm-run(s|-case)`, `ci agent-test` and `crawl`. If a change renames, removes or changes the meaning of one of those flags or their `--json` output, check the templates and the doc.

## Preview-URL Agent swarm launches

`ci agent-test --previewUrlAgentSwarm` sends `swarmKind: "preview-url"` with an
assets target whose staging backend serves every path, and the backend refuses
any other shape for that kind. When the flag, its defaults (the placeholder
upload, `--backendProxyPaths=/`) or the launch fields it sends change, check that
the backend's launch validation and its preview-URL Agent swarm docs still match.
