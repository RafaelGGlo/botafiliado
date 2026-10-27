import imageTools from '../../src/images.js';

// The transport pins DNS validation to the actual HTTPS connection.
export async function downloadImage(raw, transport = imageTools.downloadImage) {
  imageTools.checkUrl(raw);
  const image = await transport(raw);
  if (!Buffer.isBuffer(image) || !image.length || image.length > 5 * 1024 * 1024) throw Error('Invalid or oversized image');
  const jpeg = image[0] === 255 && image[1] === 216 && image[2] === 255;
  const png = image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp = image.subarray(0,4).toString() === 'RIFF' && image.subarray(8,12).toString() === 'WEBP';
  if (!jpeg && !png && !webp) throw Error('Invalid image bytes');
  return image;
}
