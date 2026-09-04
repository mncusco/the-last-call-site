import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const FREE_LIMIT = 100;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo non permesso' });
  }
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        handle TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    const rows = await sql`SELECT COUNT(*)::int AS count FROM users`;
    const count = rows[0].count;
    const remaining = Math.max(0, FREE_LIMIT - count);
    return res.status(200).json({
      count,
      limit: FREE_LIMIT,
      remaining,
      full: remaining === 0,
    });
  } catch (err) {
    console.error('Errore signup-count:', err);
    return res.status(500).json({ error: 'Errore del server' });
  }
}
