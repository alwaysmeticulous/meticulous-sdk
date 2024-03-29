import { getPort } from "../url.utils";

describe("getPort", () => {
  it("returns the port when the port is defined", () => {
    const url = new URL("http://localhost:3000");
    expect(getPort(url)).toEqual(3000);
  });

  it("returns the port when the port is not", () => {
    const url = new URL("http://localhost");
    expect(getPort(url)).toEqual(80);
  });

  it("returns the port when the port matches the default for the protocol", () => {
    const url = new URL("https://localhost:443");
    expect(getPort(url)).toEqual(443);
  });
});
