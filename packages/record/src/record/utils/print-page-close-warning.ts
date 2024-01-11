import chalk from "chalk";

export const printPageCloseWarning = (): void => {
  printWarning(
    "Login flow session recording aborted. " +
      "To complete the recording, please click the 'Finish recording' button."
  );
};

export const printNoLoginSessionRecordedWarning = (): void => {
  printWarning(
    "No login flow session was recorded. " +
      "Record your flow by signing in into your application."
  );
};

export const printWarning = (message: string): void => {
  const padding = 4; // Add extra padding for visibility
  const paddedMessage = " ".repeat(padding) + message + " ".repeat(padding);
  const border = chalk.red.bold("-".repeat(paddedMessage.length));

  console.log(border);
  console.log(chalk.red.bold(paddedMessage));
  console.log(border);
};
