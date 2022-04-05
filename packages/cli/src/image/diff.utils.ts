import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export interface CompareImageOptions {
  base: PNG;
  head: PNG;
  pixelmatchOptions?: {
    threshold: number;
  };
}

export interface CompareImageResult {
  mismatchPixels: number;
  mismatchFraction: number;
  diff: PNG;
}

export const compareImages: (
  options: CompareImageOptions
) => CompareImageResult = ({ base, head, pixelmatchOptions }) => {
  if (base.width !== head.width || base.height !== head.height) {
    throw new Error("Cannot handle different size yet");
  }

  const { width, height } = base;
  const diff = new PNG({ width, height });

  const threshold = pixelmatchOptions?.threshold || 0.01;

  const mismatchPixels = pixelmatch(
    base.data,
    head.data,
    diff.data,
    width,
    height,
    {
      threshold,
    }
  );
  const mismatchFraction = mismatchPixels / (width * height);

  return {
    mismatchPixels,
    mismatchFraction,
    diff,
  };
};
