import { validateAndParseUrl } from "../url.utils";

describe("validateAndParseUrl", () => {
  it("returns the hostname and port when the port is defined", () => {
    const { hostname, port, protocol } = validateAndParseUrl(
      "http://localhost:3000",
    );
    expect(hostname).toEqual("localhost");
    expect(protocol).toEqual("http:");
    expect(port).toEqual(3000);
  });

  it("returns the port when the port is not specified (http)", () => {
    const { hostname, port } = validateAndParseUrl("http://localhost");
    expect(hostname).toEqual("localhost");
    expect(port).toEqual(80);
  });

  it("returns the port when the port is not specified (https)", () => {
    const { hostname, port, protocol } =
      validateAndParseUrl("https://localhost");
    expect(hostname).toEqual("localhost");
    expect(protocol).toEqual("https:");
    expect(port).toEqual(443);
  });

  it("returns the port when the port matches the default for the protocol", () => {
    const { hostname, port } = validateAndParseUrl("http://localhost:80");
    expect(hostname).toEqual("localhost");
    expect(port).toEqual(80);
  });

  it("returns the port when the port matches the default for the protocol (https)", () => {
    const { hostname, port, protocol } = validateAndParseUrl(
      "https://localhost:443",
    );
    expect(hostname).toEqual("localhost");
    expect(protocol).toEqual("https:");
    expect(port).toEqual(443);
  });

  it("throws an error for invalid URLs", () => {
    expect(() => validateAndParseUrl("not-a-url")).toThrow(
      "Invalid app URL: 'not-a-url'",
    );
  });

  it("throws an error if missing prefix", () => {
    expect(() => validateAndParseUrl("localhost:3000")).toThrow(
      "Protocol 'localhost:' not supported yet: 'localhost:3000'. Only 'http:' and 'https:' are supported. Are you missing a 'http://' or 'https://' prefix?",
    );
  });

  it("throws an error for invalid protocols", () => {
    expect(() => validateAndParseUrl("ftp://localhost")).toThrow(
      "Protocol 'ftp:' not supported yet: 'ftp://localhost'. Only 'http:' and 'https:' are supported.",
    );
  });
});
