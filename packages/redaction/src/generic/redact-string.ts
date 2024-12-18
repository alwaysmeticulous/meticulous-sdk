import { asterixOut } from "./asterix-out";
import { redactEmail } from "./redact-email";
import { redactUrl } from "./redact-url";

// Intelligently redacts a string by guessing what it contains
export const redactString = (str: string) => {
  if (str.includes("@")) {
    return redactEmail(str);
  }

  if (str.startsWith("http://") || str.startsWith("https://")) {
    return redactUrl(str);
  }

  // Check if it matches ISO 8601 format
  if (str.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)) {
    return new Date(0).toISOString();
  }

  // Common number formats (SSNs, phone numbers, currency, etc)
  if (str.match(/^[$£€¥#]?[\d \-_.\/]+[%]?$/)) {
    return str.replace(/\d/g, "0");
  }

  return asterixOut(str);
};
