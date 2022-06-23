import { appendFile } from "fs/promises";
import { getTestRunUrl, TestRun } from "../api/test-run.api";
import { TestCaseResult } from "../config/config.types";

export const writeGitHubSummary: (options: {
  testRun: TestRun;
  results: TestCaseResult[];
}) => Promise<void> = async ({ testRun, results }) => {
  const summaryFile = process.env["GITHUB_STEP_SUMMARY"] || "";

  if (!summaryFile) {
    console.log(
      "Warning: $GITHUB_STEP_SUMMARY is not defined, skipping writing GitHub action summary"
    );
    return;
  }

  const testRunUrl = getTestRunUrl(testRun);

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
