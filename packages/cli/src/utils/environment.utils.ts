import { isCI, name as CIName } from "ci-info";

export type Environment =
  | {
      isCI: false;
    }
  | {
      isCI: true;
      ci: {
        name: string | null;
      };
    };

export const getEnvironment = (): Environment => {
  if (!isCI) {
    return { isCI: false };
  }

  return {
    isCI: true,
    ci: {
      name: CIName,
    },
  };
};
