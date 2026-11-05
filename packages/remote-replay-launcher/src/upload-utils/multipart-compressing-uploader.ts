import type { DeploymentArchiveType } from "@alwaysmeticulous/api";
import type {
  createClient,
  ProjectIdentifier,
  MultiPartUploadInfo,
} from "@alwaysmeticulous/client";
import { requestUploadPart } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { create as tarCreate } from "tar";
import { getCompressionConcurrency } from "./compression-concurrency";
import { MultipartBufferManager } from "./multipart-buffer-manager";
import { ParallelDeflater } from "./parallel-deflater";
import { MAX_UPLOAD_PARTS, getPartSize } from "./part-size-schedule";

export const UPLOAD_ARCHIVE_FILE_FORMAT: DeploymentArchiveType = "tar.d";

/**
 * Parts uploaded at once. Each part is its own PUT, so this is the analogue of
 * s5cmd's per-file multipart concurrency.
 */
const DEFAULT_MAX_CONCURRENT_UPLOADS = 16;
const MAX_CONCURRENT_UPLOADS_ENV_VAR = "METICULOUS_UPLOAD_CONCURRENCY";

/**
 * Compression level of the deflate algorithm. Ranges from 0 (uncompressed)
 * to 9 (maximum compression).
 */
const COMPRESSION_LEVEL = 3;

export interface MultipartCompressingUploaderArgs extends ProjectIdentifier {
  /**
   * Exactly one of `folderPath` (tarred from disk) or `tarStream` (an
   * already-built tar, e.g. read out of a Docker image) must be provided.
   */
  folderPath?: string | undefined;
  tarStream?: NodeJS.ReadableStream | undefined;
  uploadPartUrls: string[];
  uploadChunkSize: number;
  awsUploadId: string;
  uploadId: string;
  client: ReturnType<typeof createClient>;
  uploadBufferToSignedUrl: (url: string, buffer: Buffer) => Promise<string>;
  /** Overrides the default (and `METICULOUS_UPLOAD_CONCURRENCY`) part concurrency. */
  maxConcurrentUploads?: number | undefined;
}

export class MultipartCompressingUploader {
  private totalUploadedBytes = 0;
  private readonly logger = initLogger();
  private readonly bufferManager: MultipartBufferManager;

  constructor(private readonly args: MultipartCompressingUploaderArgs) {
    // The ramp starts well below the server's part size, so most early parts
    // can't use the server's pre-signed URLs (the size is part of the
    // signature) and request their own.
    this.bufferManager = new MultipartBufferManager({
      uploadChunkSize: args.uploadChunkSize,
      getPartSize: (partNumber) =>
        getPartSize(partNumber, args.uploadChunkSize),
      maxParts: MAX_UPLOAD_PARTS,
      uploadPart: this.uploadPart.bind(this),
      maxConcurrentUploads:
        args.maxConcurrentUploads ?? getMaxConcurrentUploads(),
    });
  }

  async execute(): Promise<MultiPartUploadInfo> {
    const deflater = new ParallelDeflater({
      level: COMPRESSION_LEVEL,
      concurrency: getCompressionConcurrency(),
      onOutput: async (compressed) => {
        this.bufferManager.addChunk(compressed);
        if (
          this.bufferManager.getBufferSize() >=
          this.bufferManager.getNextPartSize()
        ) {
          await this.bufferManager.flush(false);
        }
        await this.bufferManager.waitForCapacity();
      },
    });

    try {
      await this.streamTar(deflater);
    } catch (error) {
      await deflater.destroy();
      throw error;
    }
    await deflater.end();
    await this.bufferManager.flush(true);

    const eTags = await this.bufferManager.finalize();
    return { awsUploadId: this.args.awsUploadId, eTags };
  }

  private streamTar(deflater: ParallelDeflater): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const { folderPath, tarStream: providedTarStream } = this.args;
      const tarStream: NodeJS.ReadableStream | undefined = providedTarStream
        ? providedTarStream
        : folderPath
          ? (tarCreate(
              {
                cwd: folderPath,
                follow: true,
                portable: true,
              },
              ["."],
            ) as unknown as NodeJS.ReadableStream)
          : undefined;
      if (!tarStream) {
        reject(
          new Error(
            "MultipartCompressingUploader requires either folderPath or tarStream",
          ),
        );
        return;
      }

      let finished = false;
      let ended = false;
      let pendingWrite = Promise.resolve();
      const abort = (error: unknown) => {
        if (finished) {
          return;
        }
        finished = true;
        tarStream.removeListener("data", onData);
        (tarStream as { destroy?: () => void }).destroy?.();
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      const onData = (chunk: Buffer) => {
        try {
          const backpressure = deflater.write(chunk);
          if (backpressure) {
            pendingWrite = backpressure;
            tarStream.pause();
            backpressure.then(() => {
              if (!finished && !ended) {
                tarStream.resume();
              }
            }, abort);
          }
        } catch (error) {
          abort(error);
        }
      };

      tarStream.on("data", onData);
      tarStream.on("end", () => {
        ended = true;
        // Readable streams can emit end while the final write is still
        // waiting for compression capacity.
        pendingWrite.then(() => {
          finished = true;
          resolve();
        }, abort);
      });
      tarStream.on("error", abort);
      tarStream.on("close", () => {
        if (!ended) {
          abort(new Error("Tar stream closed before reaching its end"));
        }
      });
    });
  }

  private async uploadPart(
    buffer: Buffer,
    partNumber: number,
    isLastPart: boolean,
  ): Promise<string> {
    const uploadUrl = await this.getUploadUrl(buffer, partNumber, isLastPart);
    const eTag = await this.args.uploadBufferToSignedUrl(uploadUrl, buffer);

    this.totalUploadedBytes += buffer.length;
    this.logger.info(
      `Uploaded part ${partNumber} (${buffer.length} bytes, ${this.totalUploadedBytes} total)`,
    );

    return eTag;
  }

  private async getUploadUrl(
    buffer: Buffer,
    partNumber: number,
    isLastPart: boolean,
  ): Promise<string> {
    // Pre-signed URL N is signed for part number N and for exactly the server
    // part size.
    const preSignedUrl = this.args.uploadPartUrls[partNumber - 1];
    if (
      preSignedUrl !== undefined &&
      !isLastPart &&
      buffer.length === this.args.uploadChunkSize
    ) {
      return preSignedUrl;
    }

    const { uploadPartUrl } = await requestUploadPart({
      client: this.args.client,
      uploadId: this.args.uploadId,
      awsUploadId: this.args.awsUploadId,
      partNumber,
      size: buffer.length,
      archiveType: UPLOAD_ARCHIVE_FILE_FORMAT,
      ...(this.args.projectId ? { projectId: this.args.projectId } : {}),
    });

    return uploadPartUrl;
  }
}

const getMaxConcurrentUploads = (): number => {
  const fromEnv = Number.parseInt(
    process.env[MAX_CONCURRENT_UPLOADS_ENV_VAR] ?? "",
    10,
  );
  return Number.isFinite(fromEnv) && fromEnv >= 1
    ? Math.min(fromEnv, 128)
    : DEFAULT_MAX_CONCURRENT_UPLOADS;
};
