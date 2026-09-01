import { neon } from '@neondatabase/serverless';

const connectionString = process.env.The_Last_Call_DATABASE_URL || process.env.DATABASE_URL;
const sql = neon(connectionString);

export default async function handler(req, res) {
  const { secret } = req.query;

  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Non autorizzato' });
  }

  try {
    const rows = await sql`SELECT email, joined_at FROM waitlist ORDER BY joined_at ASC`;
    return res.status(200).json({ count: rows.length, signups: rows });
  } catch (err) {
    console.error('Errore lettura waitlist:', err);
    return res.status(500).json({ error: 'Errore del server' });
  }
}
