import sharp from 'sharp';

export const isHeicImage = (file: File) =>
  /^image\/(?:x-)?(?:heic|heif)(?:-sequence)?$/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);

export const isImageUpload = (file: File) => file.type.startsWith('image/') || isHeicImage(file);

export async function prepareImageUpload(file: File) {
  if (!isHeicImage(file)) return file;
  const jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
    .rotate()
    .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();
  const baseName = file.name.replace(/\.(heic|heif)$/i, '') || 'image';
  return new File([new Uint8Array(jpeg)], `${baseName}.jpg`, { type: 'image/jpeg' });
}