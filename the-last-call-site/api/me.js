import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

const sql = neon(process.env.DATABASE_URL);

function getSessionToken(req) {
  const header = req.headers.cookie || '';
  const m = header.match(/(?:^|;\s*)tlc_session=([a-f0-9]{64})/);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo non permesso' });
  }
  const token = getSessionToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Non autenticato' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const rows = await sql`
      SELECT u.email, u.handle, s.expires_at AS session_expires,
             sub.status AS sub_status, sub.expires_at AS sub_expires
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN subscriptions sub ON sub.user_id = u.id
      WHERE s.token_hash = ${tokenHash}
      LIMIT 1
    `;
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Sessione non valida' });
    }
    const row = rows[0];
    if (new Date(row.session_expires).getTime() < Date.now()) {
      await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
      return res.status(401).json({ error: 'Sessione scaduta' });
    }
    return res.status(200).json({
      ok: true,
      user: { email: row.email, handle: row.handle },
      subscription: row.sub_status
        ? { status: row.sub_status, expires_at: row.sub_expires }
        : null,
    });
  } catch (err) {
    console.error('Errore me:', err);
    return res.status(500).json({ error: 'Errore del server' });
  }
}
