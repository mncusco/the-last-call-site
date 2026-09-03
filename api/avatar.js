import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

const sql = neon(process.env.DATABASE_URL);

// MVP: foto ridotta dal browser (max 512px JPEG) e salvata su Neon come data-URL.
// Limite 700KB per non appesantire il DB. Quando gli utenti crescono,
// spostiamo su Vercel Blob senza cambiare il frontend (avatar_url resta un URL).
const MAX_BYTES = 700 * 1024;
const RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

function getSessionToken(req) {
  const header = req.headers.cookie || '';
  const m = header.match(/(?:^|;\s*)tlc_session=([a-f0-9]{64})/);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    try {
      const token = getSessionToken(req);
      if (!token) return res.status(401).json({ error: 'Non autenticato' });
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const rows = await sql`
        SELECT u.id FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ${tokenHash} AND s.expires_at > now() LIMIT 1
      `;
      if (!rows.length) return res.status(401).json({ error: 'Non autenticato' });
      await sql`UPDATE users SET avatar_url = '' WHERE id = ${rows[0].id}`;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Errore avatar DELETE:', err);
      return res.status(500).json({ error: 'Errore del server' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non permesso' });
  }

  const { avatarDataUrl } = req.body || {};
  if (typeof avatarDataUrl !== 'string' || !RE.test(avatarDataUrl)) {
    return res.status(400).json({ error: 'Immagine non valida (usa JPG, PNG o WebP)' });
  }
  // Stima byte reali dal base64 senza decodificare tutto.
  const b64len = avatarDataUrl.split(',')[1].length;
  if (Math.floor((b64len * 3) / 4) > MAX_BYTES) {
    return res.status(413).json({ error: 'Foto troppo pesante: scegli un\u2019immagine più piccola' });
  }

  try {
    const token = getSessionToken(req);
    if (!token) return res.status(401).json({ error: 'Non autenticato' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const rows = await sql`
      SELECT u.id FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ${tokenHash} AND s.expires_at > now() LIMIT 1
    `;
    if (!rows.length) return res.status(401).json({ error: 'Non autenticato' });
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT ''`;
    await sql`UPDATE users SET avatar_url = ${avatarDataUrl} WHERE id = ${rows[0].id}`;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Errore avatar POST:', err);
    return res.status(500).json({ error: 'Errore del server' });
  }
}
