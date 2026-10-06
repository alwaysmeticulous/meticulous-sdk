const BASE64_CHUNK_SIZE = 0x8000;

/** Base64 of the bytes a view covers, through `Buffer` on Node and `btoa` in a Worker. */
export const toBase64 = (view: ArrayBufferView): string => {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
};

/**
 * The bytes a base64 string encodes. On Node this is a `Buffer`, which is also a `Uint8Array` to
 * anything consuming it — so a Prisma `Bytes` field replays as the type pg returned at record time.
 */
export const fromBase64 = (base64: string): Uint8Array => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64");
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};
