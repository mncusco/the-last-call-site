import { neon } from '@neondatabase/serverless';

// Connessione lazy: se DATABASE_URL manca su Vercel, l'errore esce come
// JSON leggibile dal frontend invece di una pagina di crash del server.
let cached = null;

export function getSql() {
  if (!process.env.DATABASE_URL) {
    const err = new Error('DATABASE_URL non configurata su Vercel');
    err.code = 'NO_DATABASE_URL';
    throw err;
  }
  if (!cached) cached = neon(process.env.DATABASE_URL);
  return cached;
}

export function friendlyDbError(err) {
  if (err && err.code === 'NO_DATABASE_URL') {
    return 'Database non collegato: vai su Vercel → Settings → Environment Variables, aggiungi DATABASE_URL e rifai il deploy.';
  }
  return null;
}
