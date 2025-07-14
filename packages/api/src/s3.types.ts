export interface S3Location {
  filePath: string; // e.g. logs.ndjson.gz
  signedUrl: string; // signed S3 URL
}
