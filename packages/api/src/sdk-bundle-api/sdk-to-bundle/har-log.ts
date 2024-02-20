// Note: we don't expose the PollyJS typings here, since we don't
// want to lock ourselves into PollyJS. Instead we expose just the subset
// of the types that we actually need/use.
export interface HarLog {
  entries: HarEntry[];
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
  queryString: QueryStringNameValueEntry[];
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

  value: object | string;
}

export interface QueryStringNameValueEntry {
  name: string;

  // Query string name value entries generated by PollyJS can contain object values.
  // For example a URL like `?myObj[subProperty]=42` would give a QueryStringNameValueEntry of `{ name: 'myObj', value: { subProperty: 42 } }`.
  //
  // The HAR spec implies these should always be strings (https://github.com/ahmadnassri/har-spec/blob/master/versions/1.2.md#querystring), but
  // we err on the side of safety for now and support a looser format.
  value: object | string;
}
