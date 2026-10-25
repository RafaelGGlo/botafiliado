import { createHash } from 'node:crypto';

export async function hostInstagramImage(bytes, env, request = fetch) {
 const cloud = env.CLOUDINARY_CLOUD_NAME;
 if (!/^[\w-]+$/.test(cloud || '') || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) throw Error('Credenciais Cloudinary ausentes.');
 const timestamp = String(Math.floor(Date.now() / 1000));
 const public_id = 'instagram-auto-' + createHash('sha256').update(bytes).digest('hex').slice(0, 24);
 const signature = createHash('sha256').update(`overwrite=false&public_id=${public_id}&timestamp=${timestamp}` + env.CLOUDINARY_API_SECRET).digest('hex');
 const form = new FormData();
 form.set('file', new Blob([bytes], { type: 'image/jpeg' }), 'offer.jpg');
 for (const [key, value] of Object.entries({ api_key: env.CLOUDINARY_API_KEY, timestamp, public_id, overwrite: 'false', signature })) form.set(key, value);
 const response = await request(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(30000) });
 const result = await response.json();
 if (!response.ok) throw Error(`Hospedagem da imagem falhou (HTTP ${response.status}).`);
 const url = new URL(result.secure_url);
 if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') throw Error('Endereço de imagem inválido.');
 return url.href;
}
