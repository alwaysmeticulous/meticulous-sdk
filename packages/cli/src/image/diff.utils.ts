import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export interface CompareImageOptions {
  base: PNG;
  head: PNG;

  /**
   * Maximum colour distance a given pixel is allowed to differ before counting two
   * pixels as different.
   *
   * Measure is based on "Measuring perceived color difference using YIQ NTSC transmission color space
   * in mobile applications" by Y. Kotsarenko and F. Ramos
   */
  pixelThreshold: number;
}

export interface CompareImageResult {
  mismatchPixels: number;
  mismatchFraction: number;
  diff: PNG;
}

export const compareImages: (
  options: CompareImageOptions
) => CompareImageResult = ({ base, head, pixelThreshold }) => {
  if (base.width !== head.width || base.height !== head.height) {
    throw new Error("Cannot handle different size yet");
  }

  const { width, height } = base;
  const diff = new PNG({ width, height });

  const mismatchPixels = pixelmatch(
    base.data,
    head.data,
    diff.data,
    width,
    height,
    {
      threshold: pixelThreshold,
    }
  );
  const mismatchFraction = mismatchPixels / (width * height);

  return {
    mismatchPixels,
    mismatchFraction,
    diff,
  };
};
