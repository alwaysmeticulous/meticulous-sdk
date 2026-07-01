import { describe, expect, test } from "vitest";
import { CliUserError } from "../utils/cli-user-error";
import { detectUploadMode } from "./detect-upload-mode";

describe("detectUploadMode", () => {
  test("returns 'container' when a local image tag is provided", () => {
    expect(detectUploadMode({ localImageTag: "myapp:latest" })).toBe(
      "container",
    );
  });

  test("returns 'assets' when an app directory is provided", () => {
    expect(detectUploadMode({ appDirectory: "./dist" })).toBe("assets");
  });

  test("returns 'assets' when an app zip is provided", () => {
    expect(detectUploadMode({ appZip: "./app.zip" })).toBe("assets");
  });

  test("throws when neither container nor asset input is provided", () => {
    expect(() => detectUploadMode({})).toThrow(CliUserError);
  });

  test("throws when both container and asset input are provided", () => {
    expect(() =>
      detectUploadMode({
        localImageTag: "myapp:latest",
        appDirectory: "./dist",
      }),
    ).toThrow(CliUserError);
    expect(() =>
      detectUploadMode({ localImageTag: "myapp:latest", appZip: "./app.zip" }),
    ).toThrow(CliUserError);
  });
});
