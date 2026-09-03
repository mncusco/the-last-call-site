import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

const sql = neon(process.env.DATABASE_URL);

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function makeHandle(email) {
  const base = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 15) || 'amico';
  return base;
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
}

async function sendCodeEmail(email, code) {
  // Pronto per Resend: imposta RESEND_API_KEY + EMAIL_FROM su Vercel quando vuoi email vere.
  // Senza provider, il codice resta nei log Vercel (Function Logs) per i test.
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: email,
          subject: 'Il tuo codice di accesso — The Last Call',
          text: `Il tuo codice è ${code}. Vale 10 minuti. Se non l'hai chiesto tu, ignora pure.`,
        }),
      });
      return true;
    } catch (err) {
      console.error('Invio email fallito:', err);
      return false;
    }
  }
  console.log(`[auth] codice per ${email}: ${code}`);
  return false;
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
    await ensureTables();

    // Crea utente alla prima richiesta (la waitlist resta separata per gli inviti).
    let rows = await sql`SELECT id FROM users WHERE email = ${normalized}`;
    if (rows.length === 0) {
      const base = makeHandle(normalized);
      let handle = base;
      for (let i = 0; i < 5; i++) {
        try {
          await sql`INSERT INTO users (email, handle) VALUES (${normalized}, ${handle})`;
          break;
        } catch (e) {
          if (e?.code === '23505') {
            handle = `${base}${crypto.randomInt(10, 9999)}`;
            continue;
          }
          throw e;
        }
      }
      rows = await sql`SELECT id FROM users WHERE email = ${normalized}`;
    }
    if (rows.length === 0) {
      return res.status(500).json({ error: 'Errore del server, riprova più tardi' });
    }

    // Invalida codici precedenti ancora aperti per questa email.
    await sql`UPDATE login_codes SET used = true WHERE email = ${normalized} AND used = false`;

    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await sql`
      INSERT INTO login_codes (email, code_hash, expires_at)
      VALUES (${normalized}, ${hashCode(code)}, ${expiresAt})
    `;

    const sent = await sendCodeEmail(normalized, code);

    const out = { ok: true, emailSent: sent };
    // Solo per test locali/preview: ALLOW_DEBUG_CODES=true mostra il codice nella risposta.
    if (process.env.ALLOW_DEBUG_CODES === 'true') {
      out.devCode = code;
    }
    return res.status(200).json(out);
  } catch (err) {
    console.error('Errore auth-request:', err);
    return res.status(500).json({ error: 'Errore del server, riprova più tardi' });
  }
}
