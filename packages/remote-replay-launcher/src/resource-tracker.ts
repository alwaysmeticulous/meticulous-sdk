import os from "os";
import { TestRun } from "@alwaysmeticulous/client";
import * as Sentry from "@sentry/node";
import { Logger } from "loglevel";
import { mem } from "systeminformation";

const EVENT_LOOP_DELAY_WARNING_THRESHOLD_MS = 100;

export class ResourceTracker {
  private previousCpuUsage: { active: number; idle: number };
  private haveLoggedResourceWarning: boolean = false;
  private haveLoggedEventLoopWarning: boolean = false;
  private readonly logger: Logger;
  private readonly testRun: TestRun;

  constructor(logger: Logger, testRun: TestRun) {
    this.previousCpuUsage = this.computeCpuUsage();
    this.logger = logger;
    this.testRun = testRun;
  }

  public async checkUsage() {
    await Promise.all([
      this.maybeLogEventLoopWarning(),
      this.maybeLogResourceWarning(),
    ]);
  }

  private async maybeLogResourceWarning() {
    if (this.haveLoggedResourceWarning) {
      // We only want to log a warning once, so we can stop tracking usage once we've warned.
      return;
    }

    const currentCpuUsage = this.computeCpuUsage();
    const activeSinceLastCall =
      currentCpuUsage.active - this.previousCpuUsage.active;
    const idleSinceLastCall = currentCpuUsage.idle - this.previousCpuUsage.idle;
    const cpuUsagePercentage =
      (activeSinceLastCall / (activeSinceLastCall + idleSinceLastCall)) * 100;
    const memoryUsage = await mem();
    const memoryUsagePercentage =
      (memoryUsage.active / memoryUsage.total) * 100;

    if (cpuUsagePercentage > 80 || memoryUsagePercentage > 80) {
      this.logger.warn(
        `
          Detected that there may be resource contention on the machine (${cpuUsagePercentage.toFixed()}% CPU usage, ${memoryUsagePercentage.toFixed()}% memory usage).
          Heavy load may result in network requests not being processed and lead to flaky tests.
          We recommend running tests on a machine with more resources.
          `,
      );
      Sentry.captureMessage("Detected resource contention on tunnel machine", {
        level: "warning",
        extra: {
          cpuUsagePercentage,
          memoryUsagePercentage,
          testRunId: this.testRun.id,
          projectId: this.testRun.project.id,
        },
      });
      this.haveLoggedResourceWarning = true;
    }

    this.previousCpuUsage = currentCpuUsage;
  }

  private computeCpuUsage() {
    return os.cpus().reduce(
      (acc, cpu) => ({
        active: acc.active + cpu.times.user + cpu.times.nice + cpu.times.sys,
        idle: acc.idle + cpu.times.idle,
      }),
      { active: 0, idle: 0 },
    );
  }

  private async maybeLogEventLoopWarning() {
    if (this.haveLoggedEventLoopWarning) {
      // We only want to log a warning once, so we can stop measuring after that.
      return;
    }

    const startTime = performance.now();
    const delay = await new Promise<number>((resolve) => {
      setTimeout(() => {
        const endTime = performance.now();
        resolve(endTime - startTime);
      }, 0);
    });

    if (delay > EVENT_LOOP_DELAY_WARNING_THRESHOLD_MS) {
      this.logger.warn(
        `
          Detected event loop delay of ${delay.toFixed(0)}ms.
          This may indicate that the Node process is overloaded, which could affect test reliability.
          `,
      );
      Sentry.captureMessage("Detected event loop delay on tunnel machine", {
        level: "warning",
        extra: {
          eventLoopDelay: delay,
          testRunId: this.testRun.id,
          projectId: this.testRun.project.id,
        },
      });
      this.haveLoggedEventLoopWarning = true;
    }
  }
}
