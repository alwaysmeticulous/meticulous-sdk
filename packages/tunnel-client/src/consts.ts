// We set a higher water mark to the internal BPMux streams as with BPMux
// the muxed streams will only sent up to the high water mark to the other end
// meaning we'll have an extra round trip (status packet) if the data to be sent is larger than the high water mark.
// By default this is 16KB, which is too small for our use case.
// BPMux does that to handle backpressure.
// See https://github.com/davedoesdev/bpmux and https://nodejs.org/en/learn/modules/backpressuring-in-streams.
export const TUNNEL_HIGH_WATER_MARK = 1024 * 1024 * 10; // 10MB
