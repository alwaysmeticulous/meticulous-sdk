import { HarResponse } from "@alwaysmeticulous/api";
import {
  NetworkResponseMetadata,
  RecorderMiddleware,
} from "@alwaysmeticulous/sdk-bundles-api";

export interface TransformJSONResponseOpts<T> {
  /**
   * If specified, only URLs that match this regular expression will be redacted.
   */
  urlRegExp?: RegExp;

  /**
   * Defaults to `true`. If set the false response text which is not valid JSON will be replaced with the
   * string "<REDACTED>".
   */
  skipRedactionIfNotValidJSON?: boolean;

  /**
   * Important: please return the exact original object, not a clone, if no redaction is needed. This allows
   * us to efficiently detect that no redaction was performed, and short-circuit the redaction process.
   */
  transform: (data: T, metadata: TransformJSONResponseMetadata) => T;
}

export interface TransformJSONResponseMetadata extends NetworkResponseMetadata {
  response: HarResponse;
}

/**
 * Creates a recorder middleware that transforms JSON responses to network requests.
 */
export const transformJsonResponse = <T>({
  urlRegExp,
  skipRedactionIfNotValidJSON = true,
  transform,
}: TransformJSONResponseOpts<T>): RecorderMiddleware => {
  return {
    transformNetworkResponse: (
      response: HarResponse,
      metadata: NetworkResponseMetadata,
    ) => {
      if (urlRegExp && !urlRegExp.test(metadata.request.url)) {
        return response;
      }

      let parsed: T;
      try {
        parsed = JSON.parse(response.content.text ?? "");
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_e) {
        // If it's not valid JSON we assume it is an error/failed response so doesn't need to be redacted
        if (skipRedactionIfNotValidJSON) {
          return response;
        } else {
          return {
            ...response,
            content: {
              ...response.content,
              text: "<REDACTED>",
            },
          };
        }
      }

      const redacted = transform(parsed, {
        ...metadata,
        response,
      });

      if (redacted === parsed) {
        return response;
      }

      const responseText = JSON.stringify(redacted);
      return {
        ...response,
        content: {
          ...response.content,
          text: responseText,
        },
      };
    },
  };
};
