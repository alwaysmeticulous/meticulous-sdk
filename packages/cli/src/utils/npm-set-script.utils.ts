import { exec } from "child_process";

export const npmSetScript: (options: {
  script: string;
  command: string;
}) => Promise<string> = ({ script, command }) => {
  return new Promise((resolve, reject) => {
    exec(
      `npm set-script ${script} "${command}"`,
      { encoding: "utf-8" },
      (error, output) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(output);
      }
    );
  });
};
