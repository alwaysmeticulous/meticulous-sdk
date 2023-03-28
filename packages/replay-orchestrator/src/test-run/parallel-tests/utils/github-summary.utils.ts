import { appendFile } from "fs/promises";
import { TestCaseResult } from "@alwaysmeticulous/api";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";

export const writeGitHubSummary: (options: {
  testRunUrl: string;
  results: TestCaseResult[];
}) => Promise<void> = async ({ testRunUrl, results }) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const summaryFile = process.env["GITHUB_STEP_SUMMARY"] || "";

  if (!summaryFile) {
    logger.warn(
      "Warning: $GITHUB_STEP_SUMMARY is not defined, skipping writing GitHub action summary"
    );
    return;
  }

  const summary = `# Test Results

[View on Meticulous](${testRunUrl})

<table>
<thead>
<th>Result</th>
<th>Test Case</th>
</thead>
<tbody>
${results
  .map(
    ({ title, result }) => `<tr>
<td>${result === "pass" ? "✅️" : "❌️"}</td>
<td>${title}</td>
</tr>`
  )
  .join("\n")}
</tbody>
</table>
`;

  await appendFile(summaryFile, summary, "utf-8");
};
