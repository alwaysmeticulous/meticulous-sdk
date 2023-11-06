import { RequestFilter } from "./network-stubbing";

export interface InjectableRequestHeader {
  name: string;
  value: StaticHeaderValue | DynamicHeaderValue;
  requestTargets: AllRequests | AppUrlRequestsOnly | CustomRequests;
}
  
export interface StaticHeaderValue {
  type: "static";
  value: string;
}

// Note: only for internal use initially, but we might expose this type to users in the future.
export interface DynamicHeaderValue {
  type: "dynamic";
  calculate: (request: HTTPRequest) => Promise<string>;
}

export interface AllRequests {
  type: "all";
}

export interface AppUrlRequestsOnly {
  type: "app-url-only";
}

export interface CustomRequests {
  type: "custom";
  requestsToInjectHeaders: RequestFilter[];
}

// Note: this is a subset of the Puppeteer HTTPRequest type. Similar to the HarLog type in har-log.ts,
// we don't want tolock ourselves into Puppeteer. Additionally, this limits the scope of what the
// `calculate` function (which might become user defined) can access.
interface HTTPRequest {
  isNavigationRequest: () => boolean;
  url: () => string;
}
