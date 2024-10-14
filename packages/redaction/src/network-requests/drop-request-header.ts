import { RecorderMiddleware } from "@alwaysmeticulous/sdk-bundles-api";
import { HarRequest } from "@alwaysmeticulous/api";

/**
 * Drops a request header from network requests.
 *
 * @param headerName - Case-insensitive header name to drop.
 */
export const dropRequestHeader = (headerName: string): RecorderMiddleware => {
  return {
    transformNetworkRequest: (request: Omit<HarRequest, "queryString">) => {
      if (
        request.headers.find(
          (header) => header.name.toLowerCase() === headerName.toLowerCase()
        )
      ) {
        return {
          ...request,
          headers: request.headers.filter(
            (header) => header.name.toLowerCase() !== headerName.toLowerCase()
          ),
        };
      }
      return request;
    },

    // We're only transforming headers so don't need to apply the transformation at replay time
    applyRequestTransformationAtReplayTime: false,
  };
};
