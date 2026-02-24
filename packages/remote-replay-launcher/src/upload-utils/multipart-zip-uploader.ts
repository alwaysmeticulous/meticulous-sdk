import { constants as zlibConstants } from "zlib";
import { DeploymentArchiveType } from "@alwaysmeticulous/api";
import {
  createClient,
  requestUploadPart,
  MultiPartUploadInfo,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { DeflateRaw } from "fast-zlib";
import { create as tarCreate } from "tar";
import { MultipartBufferManager } from "./multipart-buffer-manager";

const MAX_CONCURRENT_UPLOADS = 4;
export const UPLOAD_ARCHIVE_FILE_FORMAT: DeploymentArchiveType = "tar.d";

const COMPRESSION_LEVEL = 3;

export interface MultipartCompressingUploaderArgs {
  folderPath: string;
  uploadPartUrls: string[];
  uploadChunkSize: number;
  awsUploadId: string;
  uploadId: string;
  client: ReturnType<typeof createClient>;
  uploadBufferToSignedUrl: (url: string, buffer: Buffer) => Promise<string>;
}

export class MultipartCompressingUploader {
  private totalUploadedBytes = 0;
  private preSignedUrlIndex = 0;
  private readonly logger = initLogger();
  private readonly bufferManager: MultipartBufferManager;

  constructor(private readonly args: MultipartCompressingUploaderArgs) {
    this.bufferManager = new MultipartBufferManager({
      uploadChunkSize: args.uploadChunkSize,
      uploadPart: this.uploadPart.bind(this),
      maxConcurrentUploads: MAX_CONCURRENT_UPLOADS,
    });
  }

  async execute(): Promise<MultiPartUploadInfo> {
    const deflate = new DeflateRaw({ level: COMPRESSION_LEVEL });

    await this.streamTarCompressed(deflate);

    const finalChunk = deflate.process(
      Buffer.alloc(0),
      zlibConstants.Z_FINISH,
    );
    if (finalChunk.length > 0) {
      this.bufferManager.addChunk(finalChunk);
    }
    await this.bufferManager.flush(true);

    const eTags = await this.bufferManager.finalize();
    return { awsUploadId: this.args.awsUploadId, eTags };
  }

  private streamTarCompressed(deflate: DeflateRaw): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tarStream = tarCreate(
        {
          cwd: this.args.folderPath,
          follow: true,
          portable: true,
        },
        ["."],
      );

      tarStream.on("data", (chunk: Buffer) => {
        const compressed = deflate.process(chunk);
        if (compressed.length > 0) {
          this.bufferManager.addChunk(compressed);
          if (this.bufferManager.getBufferSize() >= this.args.uploadChunkSize) {
            tarStream.pause();
            this.bufferManager
              .flush(false)
              .then(() => tarStream.resume())
              .catch(reject);
          }
        }
      });

      tarStream.on("end", resolve);
      tarStream.on("error", reject);
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
    const isFullSizeChunk = buffer.length === this.args.uploadChunkSize;
    const canUsePreSignedUrl =
      isFullSizeChunk &&
      !isLastPart &&
      this.preSignedUrlIndex < this.args.uploadPartUrls.length;

    if (canUsePreSignedUrl) {
      return this.args.uploadPartUrls[this.preSignedUrlIndex++];
    }

    const { uploadPartUrl } = await requestUploadPart({
      client: this.args.client,
      uploadId: this.args.uploadId,
      awsUploadId: this.args.awsUploadId,
      partNumber,
      size: buffer.length,
      archiveType: UPLOAD_ARCHIVE_FILE_FORMAT,
    });

    return uploadPartUrl;
  }
}
