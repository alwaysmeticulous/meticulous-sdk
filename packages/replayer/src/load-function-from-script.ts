export const loadFunctionFromScript = <T extends (...args: any[]) => any>(
  scriptPath: string,
  functionName: string
): T => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const exports = require(scriptPath);
  if (
    exports?.[functionName] != null &&
    typeof exports[functionName] === "function"
  ) {
    return exports[functionName] as T;
  }

  throw new Error(
    `${scriptPath} does not export a function called ${functionName}, instead it exports: ${JSON.stringify(
      exports
    )}`
  );
};
