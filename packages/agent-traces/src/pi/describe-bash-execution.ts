import { truncateObservationContent } from "../atif/truncate-observation-content";
import type { PiBashExecutionMessage } from "./pi-message.types";

/** The text Pi itself sends the model for a `!command` (`bashExecutionToText`). */
export const describeBashExecution = (
  message: PiBashExecutionMessage,
): string => {
  const { content: output } = truncateObservationContent(message.output);
  let text = `Ran \`${message.command}\`\n`;
  text += output ? `\`\`\`\n${output}\n\`\`\`` : "(no output)";
  if (message.cancelled) {
    text += "\n\n(command cancelled)";
  } else if (message.exitCode !== null && message.exitCode !== 0) {
    text += `\n\nCommand exited with code ${message.exitCode}`;
  }
  if (message.truncated && message.fullOutputPath) {
    text += `\n\n[Output truncated. Full output: ${message.fullOutputPath}]`;
  }
  return text;
};
