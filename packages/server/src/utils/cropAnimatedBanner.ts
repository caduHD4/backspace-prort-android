import sharp from 'sharp';
export interface BannerCrop { x: number; y: number; width: number; height: number }
export function isBannerCrop(value: unknown): value is BannerCrop {
  if (!value || typeof value !== 'object') return false;
  const crop = value as BannerCrop;
  return [crop.x, crop.y, crop.width, crop.height].every(Number.isSafeInteger) && crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0;
}

/** The largest size an animated crop is kept at; larger crops are scaled down to fit inside it. */
export interface CropBounds { width: number; height: number }

/** Bounds for the banner of a space. */
export const BANNER_CROP_BOUNDS: CropBounds = { width: 1280, height: 720 };

/**
 * Crop an animated GIF to `crop` (in the pixels of one frame) into a separate
 * GIF, scaled down to fit `bounds`. The original upload is preserved. Throws
 * when the crop leaves the image, the file is not a GIF, or it is too large to
 * decode safely.
 */
export async function cropAnimatedGif(input: string, output: string, crop: BannerCrop, bounds: CropBounds): Promise<void> {
  if (!isBannerCrop(crop)) throw new Error('Invalid image crop');
  const metadata = await sharp(input, { animated: true }).metadata();
  const width = metadata.width ?? 0;
  const frameHeight = metadata.pageHeight ?? metadata.height ?? 0;
  const pages = metadata.pages ?? 1;
  if (metadata.format !== 'gif' || pages > 240 || width * frameHeight * pages > 64_000_000 || crop.x + crop.width > width || crop.y + crop.height > frameHeight) throw new Error('Image crop exceeds image bounds or decode limits');
  await sharp(input, { animated: true, limitInputPixels: 64_000_000 })
    .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
    .resize({ width: bounds.width, height: bounds.height, fit: 'inside', withoutEnlargement: true })
    .gif().toFile(output);
}

/** Create a separate cropped GIF of a space banner. The original upload is preserved. */
export async function cropAnimatedBanner(input: string, output: string, crop: BannerCrop): Promise<void> {
  await cropAnimatedGif(input, output, crop, BANNER_CROP_BOUNDS);
}
