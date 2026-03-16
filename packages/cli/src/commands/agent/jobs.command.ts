import { createClient, getDiffsSummaryJobs } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
}

const handler = async ({ apiToken }: Options): Promise<void> => {
  initLogger();
  const client = createClient({ apiToken });

  const { jobs } = await getDiffsSummaryJobs(client);

  if (jobs.length === 0) {
    process.stderr.write("No diffs-summary jobs found.\n");
    return;
  }

  console.log(["jobId", "testRunId", "status", "progress", "error", "createdAt"].join("\t"));

  for (const job of jobs) {
    console.log(
      [
        job.jobId,
        job.testRunId,
        job.status,
        job.progress ?? "",
        job.error ?? "",
        new Date(job.createdAt).toISOString(),
      ].join("\t"),
    );
  }
};

export const testRunDiffsJobsCommand: CommandModule<unknown, Options> = {
  command: "test-run-diffs-jobs",
  describe: "List diffs-summary jobs",
  builder: {
    apiToken: { string: true, description: "Meticulous API token" },
  },
  handler: wrapHandler(handler),
};
