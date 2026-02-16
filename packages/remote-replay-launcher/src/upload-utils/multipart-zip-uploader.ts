import { stat, lstat, readdir, realpath } from "fs/promises";
import { join } from "path";
import { Writable } from "stream";
import {
  createClient,
  requestUploadPart,
  MultiPartUploadInfo,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import archiver from "archiver";
import pLimit from "p-limit";
import { MultipartBufferManager } from "./multipart-buffer-manager";

const MAX_CONCURRENT_UPLOADS = 4;
const FS_CONCURRENCY = 10;

const allWithLimit = async <I, O>(
  items: I[],
  limit: number,
  handler: (item: I) => Promise<O>,
): Promise<Awaited<O>[]> => {
  const limited = pLimit(limit);
  return Promise.all(items.map((item) => limited(() => handler(item))));
};

interface DirectoryStackEntry {
  absolutePath: string;
  pathInArchive: string;
  ancestors: Set<string>;
}

export interface MultipartZipUploaderArgs {
  folderPath: string;
  uploadPartUrls: string[];
  uploadChunkSize: number;
  awsUploadId: string;
  uploadId: string;
  client: ReturnType<typeof createClient>;
  uploadBufferToSignedUrl: (url: string, buffer: Buffer) => Promise<string>;
}

export class MultipartZipUploader {
  private totalUploadedBytes = 0;
  private preSignedUrlIndex = 0;
  private readonly logger = initLogger();
  private readonly bufferManager: MultipartBufferManager;

  constructor(private readonly args: MultipartZipUploaderArgs) {
    this.bufferManager = new MultipartBufferManager({
      uploadChunkSize: args.uploadChunkSize,
      uploadPart: this.uploadPart.bind(this),
      maxConcurrentUploads: MAX_CONCURRENT_UPLOADS,
    });
  }

  async execute(): Promise<MultiPartUploadInfo> {
    return new Promise<MultiPartUploadInfo>((resolve, reject) => {
      const archive = this.createArchive();
      const uploadStream = this.createUploadStream(resolve, reject);

      archive.on("error", reject);
      uploadStream.on("error", reject);
      archive.pipe(uploadStream);

      this.walkAndZipDirectory(archive).catch(reject);
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
    });

    return uploadPartUrl;
  }

  private createArchive() {
    return archiver("zip", {
      zlib: { level: 3 },
    });
  }

  private createUploadStream(
    resolve: (value: MultiPartUploadInfo) => void,
    reject: (reason: unknown) => void,
  ): Writable {
    return new Writable({
      write: (chunk: Buffer, _encoding, callback) => {
        this.bufferManager.addChunk(chunk);

        if (this.bufferManager.getBufferSize() >= this.args.uploadChunkSize) {
          this.bufferManager
            .flush(false)
            .then(() => callback())
            .catch(callback);
        } else {
          callback();
        }
      },
      final: (callback) => {
        this.bufferManager
          .flush(true)
          .then(() => this.bufferManager.finalize())
          .then((sortedETags) => {
            resolve({ awsUploadId: this.args.awsUploadId, eTags: sortedETags });
            callback();
          })
          .catch((err) => {
            callback(err);
            reject(err);
          });
      },
    });
  }

  private async walkAndZipDirectory(archive: archiver.Archiver): Promise<void> {
    let fileCount = 0;
    const stack: DirectoryStackEntry[] = [
      {
        absolutePath: await realpath(this.args.folderPath),
        pathInArchive: "",
        ancestors: new Set<string>(),
      },
    ];

    while (stack.length > 0) {
      const { absolutePath, pathInArchive, ancestors } = stack.pop()!;
      if (ancestors.has(absolutePath)) {
        continue;
      }

      const newAncestors = new Set([...ancestors, absolutePath]);
      const entriesWithStats = await this.getDirectoryEntriesWithStats(
        absolutePath,
        pathInArchive,
      );

      for (const entry of entriesWithStats) {
        const filesAdded = await this.processDirectoryEntry(
          archive,
          entry,
          newAncestors,
          stack,
        );
        fileCount += filesAdded;
      }
    }

    this.logger.info(`Uploading ${fileCount} files...`);
    await archive.finalize();
  }

  private async getDirectoryEntriesWithStats(
    absolutePath: string,
    pathInArchive: string,
  ) {
    const entries = await readdir(absolutePath);
    return allWithLimit(entries, FS_CONCURRENCY, async (entry) => {
      const entryAbsolutePath = join(absolutePath, entry);
      const entryPathInArchive = join(pathInArchive, entry);
      const entryStats = await lstat(entryAbsolutePath);
      return { entryAbsolutePath, entryPathInArchive, entryStats };
    });
  }

  private async processDirectoryEntry(
    archive: archiver.Archiver,
    entry: {
      entryAbsolutePath: string;
      entryPathInArchive: string;
      entryStats: ReturnType<typeof lstat> extends Promise<infer T> ? T : never;
    },
    ancestors: Set<string>,
    stack: DirectoryStackEntry[],
  ): Promise<number> {
    const { entryAbsolutePath, entryPathInArchive, entryStats } = entry;

    if (entryStats.isSymbolicLink()) {
      return this.processSymbolicLink(
        archive,
        entryAbsolutePath,
        entryPathInArchive,
        ancestors,
        stack,
      );
    }

    if (entryStats.isFile()) {
      archive.file(entryAbsolutePath, { name: entryPathInArchive });
      return 1;
    }

    if (entryStats.isDirectory()) {
      stack.push({
        absolutePath: entryAbsolutePath,
        pathInArchive: entryPathInArchive,
        ancestors,
      });
      return 0;
    }

    return 0;
  }

  private async processSymbolicLink(
    archive: archiver.Archiver,
    entryAbsolutePath: string,
    entryPathInArchive: string,
    ancestors: Set<string>,
    stack: DirectoryStackEntry[],
  ): Promise<number> {
    const targetAbsolutePath = await realpath(entryAbsolutePath);
    const targetStats = await stat(targetAbsolutePath);

    if (targetStats.isFile()) {
      archive.file(targetAbsolutePath, { name: entryPathInArchive });
      return 1;
    }

    if (targetStats.isDirectory() && !ancestors.has(targetAbsolutePath)) {
      stack.push({
        absolutePath: entryAbsolutePath,
        pathInArchive: entryPathInArchive,
        ancestors,
      });
    }

    return 0;
  }
}
