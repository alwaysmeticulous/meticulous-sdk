import chalk from "chalk";

const MESSAGE =
  "Login flow session recording aborted. " +
  "To complete the recording, please click the 'Finish recording' button.";

export const printPageCloseWarning = (): void => {
  const padding = 4; // Add extra padding for visibility
  const paddedMessage = " ".repeat(padding) + MESSAGE + " ".repeat(padding);
  const border = chalk.red.bold("-".repeat(paddedMessage.length));

  console.log(border);
  console.log(chalk.red.bold(paddedMessage));
  console.log(border);
};
