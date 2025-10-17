import * as fs from "fs";
import * as path from "path";
import { Logger } from "loglevel";

export interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    cookies: Array<{ name: string; value: string }>;
    headersSize: number;
    bodySize: number;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    cookies: Array<{ name: string; value: string }>;
    content: {
      size: number;
      mimeType: string;
    };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: {};
  timings: {
    blocked: number;
    dns: number;
    connect: number;
    send: number;
    wait: number;
    receive: number;
    ssl: number;
  };
}

export interface HarFile {
  entries: HarEntry[];
}

export class HarWriter {
  private readonly logger: Logger;
  private readonly filePath: string;
  private isInitialized = false;

  constructor(filePath: string, logger: Logger) {
    this.filePath = filePath;
    this.logger = logger;
  }

  private ensureDirectoryExists(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private initializeFile(): void {
    if (this.isInitialized) return;

    this.ensureDirectoryExists();
    fs.appendFileSync(this.filePath, "");
    this.isInitialized = true;
  }

  public addEntry(entry: HarEntry): void {
    this.initializeFile();
    fs.appendFileSync(this.filePath, JSON.stringify(entry, null, 2) + "\n");
  }

  public addRequest(
    method: string,
    url: string,
    headers: Record<string, string | string[] | undefined>,
    startTime: number,
    responseStatus?: number,
    responseHeaders?: Record<string, string | string[] | undefined>,
    endTime?: number,
  ): void {
    const startedDateTime = new Date(startTime).toISOString();
    const duration = endTime ? endTime - startTime : 0;

    const requestHeaders = Object.entries(headers).map(([name, value]) => ({
      name,
      value: Array.isArray(value) ? value.join(", ") : value || "",
    }));

    const responseHeadersArray = responseHeaders
      ? Object.entries(responseHeaders).map(([name, value]) => ({
          name,
          value: Array.isArray(value) ? value.join(", ") : value || "",
        }))
      : [];

    const entry: HarEntry = {
      startedDateTime,
      time: duration,
      request: {
        method,
        url,
        httpVersion: "HTTP/2.0",
        headers: requestHeaders,
        queryString: [],
        cookies: [],
        headersSize: -1,
        bodySize: -1,
      },
      response: {
        status: responseStatus || 0,
        statusText: responseStatus ? this.getStatusText(responseStatus) : "",
        httpVersion: "HTTP/2.0",
        headers: responseHeadersArray,
        cookies: [],
        content: {
          size: -1,
          mimeType: "",
        },
        redirectURL: "",
        headersSize: -1,
        bodySize: -1,
      },
      cache: {},
      timings: {
        blocked: 0,
        dns: 0,
        connect: 0,
        send: 0,
        wait: duration,
        receive: 0,
        ssl: 0,
      },
    };

    this.addEntry(entry);
  }

  private getStatusText(status: number): string {
    const statusTexts: Record<number, string> = {
      200: "OK",
      201: "Created",
      204: "No Content",
      301: "Moved Permanently",
      302: "Found",
      304: "Not Modified",
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      500: "Internal Server Error",
      502: "Bad Gateway",
      503: "Service Unavailable",
    };
    return statusTexts[status] || "Unknown";
  }
}
