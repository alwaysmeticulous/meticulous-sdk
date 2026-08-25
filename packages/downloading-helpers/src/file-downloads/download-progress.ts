import { Transform } from "stream";
import cliProgress from "cli-progress";

const MIN_BYTES_TO_SHOW_PROGRESS_BAR = 10_000;

const shouldShowProgressBar = (): boolean =>
  process.env.METICULOUS_IS_CLOUD_REPLAY !== "true";

const formatBytes = (bytes: number): string => {
  if (bytes === 0) {
    return "0 B";
  }
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

/**
 * One stream's participation in a {@link DownloadProgressBar}.
 */
export interface TrackedDownloadStream {
  /** Pipe the response body through this to count bytes as they arrive. */
  stream: Transform;
  /**
   * Removes this stream's bytes, and its share of the total, from the bar.
   * Call it when an attempt fails and will be retried, so the retry's bytes
   * aren't counted twice.
   */
  rollback: () => void;
}

/**
 * A terminal progress bar spanning one or more concurrent downloads.
 *
 * Sizes are registered per stream via `trackStream` rather than up front, so
 * a chunked download can render a single bar whose total grows as each
 * chunk's `content-length` arrives. The bar only appears once the registered
 * total crosses {@link MIN_BYTES_TO_SHOW_PROGRESS_BAR}, and never in cloud
 * replays.
 */
export interface DownloadProgressBar {
  trackStream: (totalBytes: number) => TrackedDownloadStream;
  stop: () => void;
}

export const createDownloadProgressBar = ({
  label = "Downloading",
}: {
  label?: string;
} = {}): DownloadProgressBar => {
  // oxlint-disable-next-line typescript-eslint/no-redundant-type-constituents -- cli-progress types resolve under tsc; tsgolint false positive
  let bar: cliProgress.SingleBar | null = null;
  let totalBytes = 0;
  let downloadedBytes = 0;
  let stopped = false;

  const render = (): void => {
    if (stopped) {
      return;
    }
    if (bar == null) {
      if (
        !shouldShowProgressBar() ||
        totalBytes < MIN_BYTES_TO_SHOW_PROGRESS_BAR
      ) {
        return;
      }
      bar = new cliProgress.SingleBar(
        {
          format: `${label} |{bar}| {percentage}% | {downloaded}/{totalSize}`,
          hideCursor: true,
          noTTYOutput: false,
          notTTYSchedule: 5000,
        },
        cliProgress.Presets.shades_classic,
      );
      bar.start(totalBytes, downloadedBytes, {
        downloaded: formatBytes(downloadedBytes),
        totalSize: formatBytes(totalBytes),
      });
      return;
    }
    bar.setTotal(totalBytes);
    bar.update(downloadedBytes, {
      downloaded: formatBytes(downloadedBytes),
      totalSize: formatBytes(totalBytes),
    });
  };

  return {
    trackStream: (streamTotalBytes: number): TrackedDownloadStream => {
      totalBytes += streamTotalBytes;
      let streamDownloadedBytes = 0;
      render();
      return {
        stream: new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            streamDownloadedBytes += chunk.length;
            downloadedBytes += chunk.length;
            render();
            callback(null, chunk);
          },
        }),
        rollback: () => {
          totalBytes -= streamTotalBytes;
          downloadedBytes -= streamDownloadedBytes;
          streamDownloadedBytes = 0;
        },
      };
    },
    stop: () => {
      stopped = true;
      bar?.stop();
      bar = null;
    },
  };
};
