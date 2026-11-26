import { WHERE_CAN_I_REACH_OUT_FOR_SUPPORT } from "../constants";

export const document = `---
{
  "title": "Viewing and exporting source coverage in Meticulous"
}
---

# {% $frontmatter.title %}

Meticulous can be set up to show you what parts of your code are being tested by us. You can view this coverage in Meticulous, or [export it as an LCOV file](#how-can-i-export-my-coverage-as-an-lcov-file) for your own tools. In order to use this feature you must be serving [source maps](https://web.dev/articles/source-maps) for your code in at least some of the environments you're testing against (for instance, if building source maps significantly slows down your build you could do this only on pushes
to your main branch to avoid delaying PR runs).

## How can I view my source coverage?

To view your coverage information, visit your project's landing page on Meticulous (that is, the \`Overview\` tab). From there click the
\`View coverage & snapshots\` button, and select the \`Sources\` tab. You'll see a list of all the files in your project, and for each file
you'll see a percentage of the lines in that file that are covered by your tests. You can click on a file to see the exact lines that are
covered and not covered.

## How can I export my coverage as an LCOV file?

The Meticulous CLI can download a test run's line coverage as an [LCOV](https://github.com/linux-test-project/lcov) file, so you can
open it in your own coverage tools or process it in a script. Run it from your repository:

\`\`\`bash
npx @alwaysmeticulous/cli download coverage --output=coverage.lcov
\`\`\`

This writes two files:

- \`coverage.lcov\`: the coverage, as an LCOV tracefile.
- \`coverage.cases.tsv\`: the sessions included in the export. Its name is the \`--output\` path with \`.lcov\` replaced by \`.cases.tsv\`.

The command signs in like the other CLI commands: pass \`--apiToken\` or set \`METICULOUS_API_TOKEN\`, or it opens your browser to log in.
The export is available from the CLI only, not from the Meticulous MCP server.

### Choosing the test run

By default the command exports the latest test run for the commit checked out in your current directory. To export a different run, pass one of:

| Flag | Exports |
|------|---------|
| \`--testRunId=<id>\` | That test run. |
| \`--prNumber=<number>\` | The latest test run for the pull request's head commit. |
| \`--commitSha=<sha>\` | The latest test run for that commit. |
| \`--latestForProject\` | The test run your project's coverage page uses. |

If you have access to more than one project, add \`--project\` to choose which one to look in.

If the test run is still in progress, the command waits for it to finish. It then waits while Meticulous builds the export, which can take a
while for a large run. Pass \`--dontWaitForTestRunToComplete\` to exit straight away instead, and run the command again later to download the
finished export.

### Choosing which sessions to include

\`--scope\` decides whose coverage goes into the file:

- \`--scope=executed\` (the default): the sessions this test run replayed. Every line was measured on this commit.
- \`--scope=selected-set\`: every session the test run is configured with. On top of the sessions the run replayed, this includes sessions
whose replays were reused from an earlier test run of the same build, and sessions whose coverage was moved forward from an earlier commit.
When coverage is moved forward, line numbers are shifted to match this commit, and lines that changed in between are estimated.

If any part of the selected set's coverage is missing, \`--scope=selected-set\` fails and says what is missing rather than writing an
incomplete file. \`--scope=executed\` still works in that case.

For example, to export the full selected set of the test run your project's coverage page uses:

\`\`\`bash
npx @alwaysmeticulous/cli download coverage --latestForProject --scope=selected-set --output=coverage.lcov
\`\`\`

### What the files contain

The LCOV file holds line coverage only. It has no branch or function records, every hit count is \`0\` or \`1\`, and file paths are relative to
your repository root. Each source file has:

- One combined record, with an empty \`TN:\` line. It lists every executable line in the file, with \`1\` if any included session ran it and
\`0\` if none did, so its \`LH\` and \`LF\` totals give the file's coverage.
- One record per session that ran code in the file, with the session ID on the \`TN:\` line. It lists only the lines that session ran.

\`\`\`
TN:
SF:src/components/button.tsx
DA:1,1
DA:2,1
DA:5,0
LH:2
LF:3
end_of_record
TN:<sessionId>
SF:src/components/button.tsx
DA:1,1
DA:2,1
LH:2
LF:2
end_of_record
\`\`\`

The cases file is a tab-separated table with one row per session:

- \`session_id\`: the session ID, as used on the \`TN:\` lines of the LCOV file.
- \`origin\`: \`measured\` if this test run replayed the session, \`reused\` if its replay was reused from an earlier test run of the same build,
or \`transferred\` if its coverage was moved forward from an earlier commit.
- \`description\`: the session's description, when it has one.

Pass \`--json\` to print a summary of the export instead of the file path: the files written, how many sessions it includes of each origin, and
its line totals.

### When the export isn't available

- Test runs that were skipped, or that never replayed any sessions, have no coverage to export.
- If your organization has turned off source code access for the project, the export is refused.

## How can I serve source maps so Meticulous finds them?

Meticulous will autodetect your source maps in three different ways (you only need to do one of these):

1. You serve the source map in the same directory as the file it corresponds to, with the same name as the file, but with a \`.map\`
extension added at the end. For instance, if you have a file \`https://mysite.com/static/assets/index.js\` then you should serve the
source map at \`https://mysite.com/static/assets/index.js.map\`.
2. You have a \`sourceMappingURL\` comment at the end of your file that points to the source map as documented
[here](https://firefox-source-docs.mozilla.org/devtools-user/debugger/how_to/use_a_source_map/index.html).
3. You set the \`SourceMap\` HTTP header on the response that serves the file to point to the source map as documented
[here](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/SourceMap).


## Monorepos

If you&apos;re using a monorepo, you&apos;ll need to build source maps for each package in your monorepo that your app depends on.

For example, if your app is within \`apps/frontend\` and you have a package \`packages/utils\` that the app depends on,
you&apos;ll need to build source maps for both of these packages. You might need to adjust your build process to load source maps
for your dependencies, e.g. by using \`source-map-loader\` in your webpack config.


### Example Next.js setup

1. Enable source maps generation in your dependent packages.
  \`packages/utils/tsconfig.json\`:
    \`\`\`json
    {
      ...
      "sourceMap": true,
      "declarationMap": true
    }
    \`\`\`
2. Install \`source-map-loader\` in your Next.js project:
      \`\`\`bash
      npm install --save-dev source-map-loader <OR>
      yarn add --dev source-map-loader <OR>
      pnpm add --save-dev source-map-loader
      \`\`\`
3. Add the following to your Next.js project&apos;s \`next.config.js\` in order to load source maps from your monorepo packages:
      \`\`\`javascript
      module.exports = {
        ...
        webpack: (config, { isServer }) => {
          // Ensure TypeScript source maps from monorepo packages work correctly
          config.module.rules.push({
            test: /\\.js$/,
            use: ['source-map-loader'],
            enforce: 'pre',
          });

          // Silence source map parsing warnings.
          config.ignoreWarnings = [
            ...(config.ignoreWarnings || []),
            /Failed to parse source map/,
          ];

          return config;
        },
      };
      \`\`\`

${WHERE_CAN_I_REACH_OUT_FOR_SUPPORT}
`;
