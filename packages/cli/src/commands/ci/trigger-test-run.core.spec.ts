import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as RemoteReplayLauncher from "@alwaysmeticulous/remote-replay-launcher";
import {
  readCompletedUpload,
  uploadAssetsAndTriggerTestRun,
  withCompletedUpload,
} from "@alwaysmeticulous/remote-replay-launcher";
import { CliUserError } from "../../utils/cli-user-error";
import { OutOfDateCLIError } from "../../utils/out-of-date-client-error";
import { awaitTestRunCompletion } from "../../utils/resolve-test-run-from-commit";
import { isStructuredCiJsonInvocation } from "./ci-command-result";
import { resolveGitOptions } from "./resolve-git-options";
import { triggerTestRun } from "./trigger-test-run.core";

vi.mock("@alwaysmeticulous/client", () => ({
  createClientWithOAuth: vi.fn(),
  resolveApiTokenWithOAuth: vi.fn().mockResolvedValue("token"),
}));
vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));
vi.mock("@alwaysmeticulous/remote-replay-launcher", async (importOriginal) => {
  const actual = await importOriginal<typeof RemoteReplayLauncher>();
  return {
    carryCompletedUpload: actual.carryCompletedUpload,
    readCompletedUpload: actual.readCompletedUpload,
    withCompletedUpload: actual.withCompletedUpload,
    uploadAssetsAndTriggerTestRun: vi.fn(),
    uploadContainer: vi.fn(),
  };
});
vi.mock("@sentry/node", () => ({
  captureMessage: vi.fn(),
}));
vi.mock("../../utils/resolve-project-identifier", () => ({
  resolveProjectIdentifier: vi.fn().mockResolvedValue({ projectId: "project" }),
}));
vi.mock("../../utils/resolve-test-run-from-commit", () => ({
  awaitTestRunCompletion: vi.fn(),
}));
vi.mock("./resolve-git-options", () => ({
  hasGitContextForTestRunWait: vi.fn().mockReturnValue(true),
  resolveGitOptions: vi.fn(),
}));

const options = {
  appDirectory: "/tmp/app",
  waitForBase: true,
  waitForTestRunToComplete: false,
  json: false,
};

describe("triggerTestRun CI outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveGitOptions).mockResolvedValue({
      commitSha: "head",
      baseSha: "base",
      gitDiffOutput: "diff",
    });
  });

  it("returns a successful run result", async () => {
    vi.mocked(uploadAssetsAndTriggerTestRun).mockResolvedValue({
      testRun: { id: "run-1" },
    } as never);

    await expect(triggerTestRun(options)).resolves.toEqual({
      outcome: "success",
      testRunId: "run-1",
      status: null,
    });
  });

  it("includes the deployment id and test run URL", async () => {
    vi.mocked(uploadAssetsAndTriggerTestRun).mockResolvedValue({
      testRun: {
        id: "run-1",
        url: "https://app.meticulous.ai/projects/org/proj/test-runs/run-1",
      },
      sourceDeploymentId: "deploy-1",
    } as never);

    await expect(triggerTestRun(options)).resolves.toEqual({
      outcome: "success",
      testRunId: "run-1",
      status: null,
      sourceDeploymentId: "deploy-1",
      testRunUrl: "https://app.meticulous.ai/projects/org/proj/test-runs/run-1",
    });
  });

  it("keeps the run's ids when waiting ends in an aborted run", async () => {
    vi.mocked(uploadAssetsAndTriggerTestRun).mockResolvedValue({
      testRun: {
        id: "run-1",
        url: "https://app.meticulous.ai/projects/org/proj/test-runs/run-1",
      },
      sourceDeploymentId: "deploy-1",
    } as never);
    vi.mocked(awaitTestRunCompletion).mockRejectedValue(
      new CliUserError(
        "Test run run-1 finished unsuccessfully (status: Aborted).",
        1,
        "error",
        { reason: "remote" },
      ),
    );

    const error: unknown = await triggerTestRun({
      ...options,
      waitForTestRunToComplete: true,
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(CliUserError);
    expect(error).toMatchObject({
      reason: "remote",
      testRunId: "run-1",
      testRunUrl: "https://app.meticulous.ai/projects/org/proj/test-runs/run-1",
      sourceDeploymentId: "deploy-1",
    });
  });

  it("keeps the deployment id when an out-of-date client error is replaced", async () => {
    vi.mocked(uploadAssetsAndTriggerTestRun).mockRejectedValue(
      withCompletedUpload(
        Object.assign(new Error("old"), { name: "OutOfDateClient" }),
        { sourceDeploymentId: "deploy-1" },
      ),
    );

    const error: unknown = await triggerTestRun(options).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(OutOfDateCLIError);
    expect(readCompletedUpload(error)).toEqual({
      sourceDeploymentId: "deploy-1",
    });
  });

  it("returns an author-gated skip", async () => {
    vi.mocked(uploadAssetsAndTriggerTestRun).mockResolvedValue({
      testRun: null,
      skipReason: "comments_disabled_for_author",
      message: "Skipped for this author",
    });

    await expect(triggerTestRun(options)).resolves.toMatchObject({
      outcome: "skipped",
      reason: "comments_disabled_for_author",
    });
  });

  it("skips before uploading when there is nothing to test", async () => {
    vi.mocked(resolveGitOptions).mockResolvedValue({
      commitSha: "same",
      baseSha: "same",
      gitDiffOutput: undefined,
    });

    await expect(triggerTestRun(options)).resolves.toMatchObject({
      outcome: "skipped",
      reason: "nothing_to_test",
    });
    expect(uploadAssetsAndTriggerTestRun).not.toHaveBeenCalled();
  });
});

describe("isStructuredCiJsonInvocation", () => {
  it("matches only the selected CI commands with --json", () => {
    expect(
      isStructuredCiJsonInvocation(["ci", "upload-assets", "--json"]),
    ).toBe(true);
    expect(
      isStructuredCiJsonInvocation(["ci", "upload-asset-chunk", "--json"]),
    ).toBe(false);
  });

  it("matches --json inside --jsonArgs / --rawJson", () => {
    expect(
      isStructuredCiJsonInvocation([
        "ci",
        "upload-assets",
        "--jsonArgs",
        '{"json":true}',
      ]),
    ).toBe(true);
    expect(
      isStructuredCiJsonInvocation([
        "ci",
        "upload-container",
        '--rawJson={"json":true}',
      ]),
    ).toBe(true);
    expect(
      isStructuredCiJsonInvocation([
        "ci",
        "upload-assets",
        "--jsonArgs",
        '{"appDirectory":"/tmp"}',
      ]),
    ).toBe(false);
  });
});
