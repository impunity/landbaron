import convertHeic from 'heic-convert';
import sharp from 'sharp';

export const isHeicImage = (file: File) => ['image/heic', 'image/heif'].includes(file.type) || /\.(heic|heif)$/i.test(file.name);

export const isImageUpload = (file: File) => file.type.startsWith('image/') || isHeicImage(file);

export async function prepareImageUpload(file: File) {
  if (!isHeicImage(file)) return file;
  const jpeg = await convertHeic({ buffer: Buffer.from(await file.arrayBuffer()), format: 'JPEG', quality: 0.8 });
  const resized = await sharp(Buffer.from(jpeg)).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
  return new File([new Uint8Array(resized)], file.name.replace(/\.(heic|heif)$/i, '') + '.jpg', { type: 'image/jpeg' });
}