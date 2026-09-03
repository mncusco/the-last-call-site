import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

const sql = neon(process.env.DATABASE_URL);

function getSessionToken(req) {
  const header = req.headers.cookie || '';
  const m = header.match(/(?:^|;\s*)tlc_session=([a-f0-9]{64})/);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non permesso' });
  }
  const token = getSessionToken(req);
  if (token) {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
    } catch (err) {
      console.error('Errore logout:', err);
    }
  }
  res.setHeader(
    'Set-Cookie',
    'tlc_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax'
  );
  return res.status(200).json({ ok: true });
}
