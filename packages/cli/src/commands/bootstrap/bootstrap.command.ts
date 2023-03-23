import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import chalk from "chalk";
import log from "loglevel";
import { buildCommand } from "../../command-utils/command-builder";
import { readConfig, saveConfig } from "../../config/config";
import { MeticulousCliConfig } from "../../config/config.types";
import { npmSetScript } from "../../utils/npm-set-script.utils";

type Options = Record<string, unknown>;

const handler: (options: Options) => Promise<void> = async () => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  logger.info(`Setting up ${chalk.green("meticulous.json")}...`);
  const meticulousConfig = await readConfig();
  const newConfig: MeticulousCliConfig = {
    ...meticulousConfig,
    testCases: [...(meticulousConfig.testCases || [])],
  };
  await saveConfig(newConfig);

  logger.info(`Setting up ${chalk.green("test:meticulous")} script...`);
  await npmSetScript({
    script: "test:meticulous",
    command: "meticulous run-all-tests --headless --parallelize",
  });
};

export const bootstrapCommand = buildCommand("bootstrap")
  .details({
    describe: "Bootstrap your project to use Meticulous",
  })
  .options({})
  .handler(handler);
