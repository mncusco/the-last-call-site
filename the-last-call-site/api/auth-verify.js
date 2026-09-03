import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

const sql = neon(process.env.DATABASE_URL);

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function sessionCookie(token, secure) {
  const parts = [
    `tlc_session=${token}`,
    'HttpOnly',
    'Path=/',
    'Max-Age=2592000',
    'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      handle TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS login_codes (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non permesso' });
  }

  const { email, code } = req.body || {};
  if (!email || !code || typeof email !== 'string' || typeof code !== 'string') {
    return res.status(400).json({ error: 'Email e codice richiesti' });
  }
  const normalized = email.trim().toLowerCase();
  const cleanCode = code.trim();

  if (!/^\d{6}$/.test(cleanCode)) {
    return res.status(400).json({ error: 'Codice non valido' });
  }

  try {
    await ensureTables();

    const rows = await sql`
      SELECT id, code_hash, expires_at, attempts
      FROM login_codes
      WHERE email = ${normalized} AND used = false
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Codice scaduto o non trovato. Richiedine uno nuovo.' });
    }

    const row = rows[0];
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await sql`UPDATE login_codes SET used = true WHERE id = ${row.id}`;
      return res.status(401).json({ error: 'Codice scaduto. Richiedine uno nuovo.' });
    }
    if (row.attempts >= 5) {
      await sql`UPDATE login_codes SET used = true WHERE id = ${row.id}`;
      return res.status(401).json({ error: 'Troppi tentativi. Richiedi un nuovo codice.' });
    }

    const a = Buffer.from(hashCode(cleanCode), 'hex');
    const b = Buffer.from(row.code_hash, 'hex');
    const match = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!match) {
      await sql`UPDATE login_codes SET attempts = attempts + 1 WHERE id = ${row.id}`;
      return res.status(401).json({ error: 'Codice errato. Riprova.' });
    }

    await sql`UPDATE login_codes SET used = true WHERE id = ${row.id}`;

    const users = await sql`SELECT id, handle FROM users WHERE email = ${normalized}`;
    if (users.length === 0) {
      return res.status(401).json({ error: 'Utente non trovato. Richiedi un nuovo codice.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await sql`
      INSERT INTO sessions (token_hash, user_id, expires_at)
      VALUES (${hashToken(token)}, ${users[0].id}, ${expiresAt})
    `;

    const proto = req.headers['x-forwarded-proto'];
    const secure = proto === 'https' || process.env.VERCEL === '1';
    res.setHeader('Set-Cookie', sessionCookie(token, secure));
    return res.status(200).json({ ok: true, handle: users[0].handle });
  } catch (err) {
    console.error('Errore auth-verify:', err);
    return res.status(500).json({ error: 'Errore del server, riprova più tardi' });
  }
}
