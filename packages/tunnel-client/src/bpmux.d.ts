/**
 * Note event typings are not accurate and only cover subset of what we use.
 *
 * See https://github.com/davedoesdev/bpmux.
 */

declare module "bpmux" {
  import { Http2Session } from "node:http2";
  import { Duplex } from "stream";

  interface BPMuxDuplexOpts {
    /**
     * Maximum number of bytes to write to the Duplex at once, regardless of how many bytes the peer is free to receive.
     * Defaults to 0 (no limit).
     */
    max_write_size?: number;

    /**
     * Whether to check if more data than expected is being received.
     * If true and the Duplex's high-water mark for reading is exceeded then the Duplex emits an error event.
     * This should not normally occur unless you add data yourself using readable.unshift — in which case you should set check_read_overflow to false.
     * Defaults to true.
     */
    check_read_overflow?: boolean;
  }

  interface GenericDuplexOpts {
    /**
     * From StreamOptions.
     *
     * These will be passed to the Duplex constructor.
     */
    highWaterMark?: number | undefined;
  }

  export class BPMux {
    constructor(
      carrier: Duplex | Http2Session,
      opts?: GenericDuplexOpts & {
        /**
         * Whether to batch together writes to the carrier.
         * When the carrier indicates it's ready to receive data, its spare capacity is shared equally between the multiplexed streams.
         * By default, the data from each stream is written separately to the carrier.
         * Specify true to write all the data to the carrier in a single write.
         * Depending on the carrier, this can be more performant.
         */
        coalesce_writes?: boolean;
        /**
         * BPMux assigns unique channel numbers to multiplexed streams.
         * By default, it assigns numbers in the range [0..2^31).
         * If your application can synchronise the two BPMux instances on each end of the carrier stream so they never call multiplex
         * at the same time then you don't need to worry about channel number clashes.
         * For example, one side of the carrier could always call multiplex and the other listen for handshake events.
         * Or they could take it in turns. If you can't synchronise both sides of the carrier, you can get one side to use
         * a different range by specifying high_channels as true.
         * The BPMux with high_channels set to true will assign channel numbers in the range [2^31..2^32).
         */
        high_channels?: boolean;

        /**
         * Maximum number of multiplexed streams that can be open at a time. Defaults to 0 (no maximum).
         */
        max_open?: number;

        /**
         * BPMux adds a control header to each message it sends, which the receiver reads into memory.
         * The header is of variable length — for example, handshake messages contain handshake data which can be supplied by the application.
         * max_header_size is the maximum number of header bytes to read into memory.
         * If a larger header is received, BPMux emits an error event.
         * Defaults to 0 (no limit).
         */
        max_header_size?: number;

        /**
         * keep_alive Send a single byte keep-alive message every N milliseconds.
         * Defaults to 30000 (30 seconds).
         * Pass false to disable.
         */
        keep_alive?: boolean;

        peer_multiplex_options?: GenericDuplexOpts & BPMuxDuplexOpts;
      }
    ): Duplex;

    on(event: "handshake", listener: (duplex: Duplex) => void): this;
    on(event: "error", listener: (err: Error) => void): this;

    multiplex(opts?: GenericDuplexOpts & BPMuxDuplexOpts): Duplex;
  }
}
