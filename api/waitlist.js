import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS waitlist (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non permesso' });
  }

  const { email } = req.body || {};

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email non valida' });
  }

  const normalized = email.trim().toLowerCase();

  try {
    await ensureTable();

    const existing = await sql`SELECT 1 FROM waitlist WHERE email = ${normalized}`;

    if (existing.length > 0) {
      return res.status(200).json({ ok: true, alreadyJoined: true });
    }

    await sql`INSERT INTO waitlist (email) VALUES (${normalized})`;

    return res.status(200).json({ ok: true, alreadyJoined: false });
  } catch (err) {
    console.error('Errore salvataggio waitlist:', err);
    return res.status(500).json({ error: 'Errore del server, riprova più tardi' });
  }
}
