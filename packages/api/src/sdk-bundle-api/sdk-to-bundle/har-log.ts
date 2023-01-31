// Note: we don't expose the PollyJS typings here, since we don't
// want to lock ourselves into PollyJS. Instead we expose just the subset
// of the types that we actually need/use.
export interface HarLog {
  log: HarEntry[];
}

export interface HarEntry {
  _order: number;
  startedDateTime: string;
  request: HarRequest;
  response: HarResponse;

  /**
   * Time in ms between request started and response received.
   */
  time: number;
}

export interface HarRequest {
  url: string;
  method: string;
  headers: NameValueEntry[];
  queryString: NameValueEntry[];
  postData?: {
    mimeType: string;
    text?: string;
  };
}

export interface HarResponse {
  status: number;
  headers: NameValueEntry[];
  content: {
    mimeType: string;
    text?: string;
    encoding?: string;
  };
}

export interface NameValueEntry {
  name: string;
  value: string;
}
