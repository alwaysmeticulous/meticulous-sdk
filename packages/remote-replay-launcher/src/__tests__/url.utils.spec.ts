import { extractHostnameAndPort } from "../url.utils";

describe("extractHostnameAndPort", () => {
  it("returns the hostname and port when the port is defined", () => {
    const { hostname, port } = extractHostnameAndPort("http://localhost:3000");
    expect(hostname).toEqual("localhost");
    expect(port).toEqual(3000);
  });

  it("returns the port when the port is not specified (http)", () => {
    const { hostname, port } = extractHostnameAndPort("http://localhost");
    expect(hostname).toEqual("localhost");
    expect(port).toEqual(80);
  });

  it("returns the port when the port is not specified (https)", () => {
    const { hostname, port } = extractHostnameAndPort("https://localhost");
    expect(hostname).toEqual("localhost");
    expect(port).toEqual(443);
  });

  it("returns the port when the port matches the default for the protocol", () => {
    const { hostname, port } = extractHostnameAndPort("http://localhost:80");
    expect(hostname).toEqual("localhost");
    expect(port).toEqual(80);
  });

  it("returns the port when the port matches the default for the protocol (https)", () => {
    const { hostname, port } = extractHostnameAndPort("http://localhost:443");
    expect(hostname).toEqual("localhost");
    expect(port).toEqual(443);
  });

  it("throws an error for invalid URLs", () => {
    expect(() => extractHostnameAndPort("not-a-url")).toThrow(
      "Invalid app URL: 'not-a-url'",
    );
  });

  it("throws an error if missing prefix", () => {
    expect(() => extractHostnameAndPort("localhost:3000")).toThrow(
      "Protocol 'localhost:' not supported yet: 'localhost:3000'. Only 'http:' and 'https:' are supported. Are you missing a 'http://' or 'https://' prefix?",
    );
  });

  it("throws an error for invalid protocols", () => {
    expect(() => extractHostnameAndPort("ftp://localhost")).toThrow(
      "Protocol 'ftp:' not supported yet: 'ftp://localhost'. Only 'http:' and 'https:' are supported.",
    );
  });
});
