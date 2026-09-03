import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

const sql = neon(process.env.DATABASE_URL);

function getSessionToken(req) {
  const header = req.headers.cookie || '';
  const m = header.match(/(?:^|;\s*)tlc_session=([a-f0-9]{64})/);
  return m ? m[1] : null;
}

async function ensureColumns() {
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT ''`;
}

async function currentUser(req) {
  const token = getSessionToken(req);
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const rows = await sql`
    SELECT u.id, u.email, u.handle, u.bio, u.avatar_url,
           sub.status AS sub_status, sub.expires_at AS sub_expires
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN subscriptions sub ON sub.user_id = u.id
    WHERE s.token_hash = ${tokenHash}
      AND s.expires_at > now()
    LIMIT 1
  `;
  return rows.length ? rows[0] : null;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      await ensureColumns();
      const me = await currentUser(req);
      if (!me) return res.status(401).json({ error: 'Non autenticato' });
      return res.status(200).json({
        ok: true,
        user: {
          email: me.email,
          handle: me.handle,
          bio: me.bio || '',
          avatar_url: me.avatar_url || '',
        },
        subscription: me.sub_status
          ? { status: me.sub_status, expires_at: me.sub_expires }
          : null,
      });
    } catch (err) {
      console.error('Errore profile GET:', err);
      return res.status(500).json({ error: 'Errore del server' });
    }
  }

  if (req.method === 'PATCH') {
    const { handle, bio } = req.body || {};
    if (handle !== undefined && !/^[a-z0-9_]{3,20}$/.test(String(handle))) {
      return res.status(400).json({ error: 'Handle: 3-20 caratteri, solo minuscole, numeri e _' });
    }
    if (bio !== undefined && (typeof bio !== 'string' || bio.length > 280)) {
      return res.status(400).json({ error: 'Bio max 280 caratteri' });
    }
    try {
      await ensureColumns();
      const me = await currentUser(req);
      if (!me) return res.status(401).json({ error: 'Non autenticato' });
      if (handle !== undefined && handle !== me.handle) {
        try {
          await sql`UPDATE users SET handle = ${String(handle).toLowerCase()} WHERE id = ${me.id}`;
        } catch (e) {
          if (e?.code === '23505') {
            return res.status(409).json({ error: 'Handle già in uso, scegline un altro' });
          }
          throw e;
        }
      }
      if (bio !== undefined) {
        await sql`UPDATE users SET bio = ${bio} WHERE id = ${me.id}`;
      }
      const updated = await sql`SELECT handle, bio FROM users WHERE id = ${me.id}`;
      return res.status(200).json({ ok: true, user: updated[0] });
    } catch (err) {
      console.error('Errore profile PATCH:', err);
      return res.status(500).json({ error: 'Errore del server' });
    }
  }

  return res.status(405).json({ error: 'Metodo non permesso' });
}
