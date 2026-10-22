let cliVersion = "unknown";

/** The CLI package's version, read from its package.json at startup. */
export const setCliVersion = (version: string): void => {
  cliVersion = version;
};

export const getCliVersion = (): string => cliVersion;
