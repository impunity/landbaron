// Vercel rejects serverless request bodies over ~4.5 MB with a 413 before the route runs.
export const MAX_SERVER_UPLOAD_BYTES = 4 * 1024 * 1024;

export const formatMegabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

// Re-encodes large photos as JPEG in the browser so they fit under the upload limit.
// Returns the original file when it is already small enough or the browser cannot decode it.
export async function shrinkImageForUpload(file: File, maxBytes = MAX_SERVER_UPLOAD_BYTES): Promise<File> {
  if (file.size <= maxBytes || typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }

  try {
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    for (const maxDimension of [2400, 1800, 1400]) {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.85, 0.75, 0.65]) {
        const blob = await canvasToBlob(canvas, quality);
        if (blob && blob.size <= maxBytes) {
          return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
        }
      }
    }
    return file;
  } finally {
    bitmap.close();
  }
}

const isShrinkableImage = (file: File) => /^image\/(?:jpeg|png|webp|heic|heif)$/i.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);

// Shrinks images when needed and throws a user-facing error if the file still exceeds the upload limit.
export async function prepareFileForUpload(file: File, maxBytes = MAX_SERVER_UPLOAD_BYTES): Promise<File> {
  const prepared = isShrinkableImage(file) ? await shrinkImageForUpload(file, maxBytes) : file;
  if (prepared.size <= maxBytes) return prepared;

  const kind = file.type.startsWith('video/') ? 'video' : 'file';
  const advice = kind === 'video'
    ? 'Try a shorter clip or a lower video resolution.'
    : "Try exporting it at a smaller size or as a JPEG.";
  throw new Error(`"${file.name}" is ${formatMegabytes(file.size)}; uploads must be ${formatMegabytes(maxBytes)} or smaller. ${advice}`);
}

export const uploadTooLargeMessage = (file: File, maxBytes = MAX_SERVER_UPLOAD_BYTES) =>
  `"${file.name}" is too large to upload (${formatMegabytes(file.size)}). Uploads must be ${formatMegabytes(maxBytes)} or smaller.`;
