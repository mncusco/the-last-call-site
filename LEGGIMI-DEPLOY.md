# The Last Call — guida al deploy (nessun codice da scrivere)

Questa cartella contiene tutto il necessario per pubblicare il sito su Vercel
con una vera lista d'attesa (le email vengono salvate davvero, non solo
mostrate a video).

## 1. Carica il progetto su Vercel

1. Vai su vercel.com e accedi (o crea un account gratuito).
2. Clicca "Add New" → "Project".
3. Carica questa intera cartella (`the-last-call-site`) — ad esempio
   trascinandola, oppure collegandola a un repository GitHub se preferisci
   quella strada.
4. Lascia le impostazioni di build come sono proposte di default e clicca
   "Deploy".

## 2. Lo storage (dove vengono salvate le email)

Hai già creato il database da Vercel (Storage → Postgres, tramite Neon).
Vercel ha collegato da solo la variabile d'ambiente `DATABASE_URL` al
progetto — non serve copiarla o incollarla altrove. Se in futuro devi
rigenerarla, fallo dal pannello Storage del progetto su Vercel, mai
condividendola altrove.

## 3. Crea una password per vedere la lista iscritti

1. Vai su **Settings** → **Environment Variables**.
2. Aggiungi una variabile chiamata `ADMIN_SECRET` e come valore scegli
   una password a piacere (es. una frase lunga solo tua).
3. Salva.

## 4. Rifai il deploy

Dopo aver aggiunto la password `ADMIN_SECRET`, vai su **Deployments** e
clicca **Redeploy** sull'ultimo deploy, così le nuove impostazioni vengono
applicate. Ricorda anche di caricare questi file aggiornati (che ora usano
Postgres invece di KV) sopra la versione già online.

## 5. Come vedere chi si è iscritto

Apri nel browser (sostituendo con il tuo dominio e la tua password):

```
https://tuosito.vercel.app/api/waitlist-list?secret=LA_TUA_PASSWORD
```

Vedrai l'elenco di tutte le email iscritte con data e ora.

## Cosa fare se qualcosa non funziona

Se il pulsante "Iscriviti alla lista d'attesa" nel sito dà errore, il
motivo più comune è che lo storage KV non è ancora collegato (punto 2) o
che serve un nuovo deploy dopo averlo collegato (punto 4). In quel caso,
mandami un messaggio con quello che vedi a schermo e ti aiuto a risolvere.
