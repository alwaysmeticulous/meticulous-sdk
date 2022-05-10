import { writeFile } from "fs/promises";
import { TestRun } from "../api/test-run.api";
import { TestCaseResult } from "../config/config.types";

const GITHUB_SUMMARY_FILE = "github-summary.md";

export const writeGitHubSummary: (options: {
  testRun: TestRun;
  results: TestCaseResult[];
}) => Promise<void> = async ({ testRun, results }) => {
  const { project } = testRun;
  const testRunUrl = `https://app.meticulous.ai/projects/${project.organization.name}/${project.name}/test-runs/${testRun.id}`;

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

  await writeFile(GITHUB_SUMMARY_FILE, summary, "utf-8");
};
