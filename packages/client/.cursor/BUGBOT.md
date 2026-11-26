## Agent swarm review & progress blob shapes

`src/api/agentic-session-generation.api.ts` defines `AgenticRunResultBlob`,
`AgenticRunSummary`, `AgenticRunSummaryTakeaway`, and `AgenticRunProgressSnapshot`,
which `packages/full-stack-tests/src/seed-scenarios/` builds directly. If those
shapes or required fields change, check whether
`packages/full-stack-tests/src/seed-scenarios/blobs.ts` and
`packages/full-stack-tests/src/seed-scenarios/__docs__/README.md` need updating.
