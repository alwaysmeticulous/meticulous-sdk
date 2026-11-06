import inquirer from "inquirer";

/** Claude Code takes over the terminal, so let the user read the summary first. */
export const confirmLaunch = async (): Promise<boolean> => {
  const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
    {
      type: "confirm",
      name: "proceed",
      message: "Start Claude Code now?",
      default: true,
    },
  ]);
  return proceed;
};
