# 🟠 FantaSanRocco

Web app goliardica per la festa di **San Rocco** a **Siano (SA)**, ispirata al FantaSanremo.
Gli utenti si registrano, completano **missioni** (es. *shot con Zio Max* 🥃), caricano la
foto-prova, e lo **staff** la valida. I punti vanno in una **classifica generale**.
Chi vince si porta a casa un **weekend in Europa per 2 persone** ✈️.

- **Costo: 0 €** — gira sul tuo computer, si pubblica gratis con Cloudflare Tunnel.
- **Mobile-first** — pensata per essere usata dal telefono in piazza.
- **Ruoli**: utente, moderatore (valida le prove), admin (gestisce missioni e ruoli).
- **Tecnologie**: Node.js + Express + SQLite + EJS, tutto in un container Docker.

---

## 📦 Cosa ti serve

Sul **computer che farà da server** (quello che terrai acceso durante la festa):

1. **Docker Desktop** → https://www.docker.com/products/docker-desktop/ (gratis, Windows/Mac/Linux)
2. **cloudflared** (per pubblicare l'app online gratis) → vedi sezione "Pubblicare online".

Non serve installare Node manualmente: ci pensa Docker.

---

## 🚀 Avvio in locale (3 passi)

Apri il **Terminale** nella cartella del progetto ed esegui:

```bash
# 1) Crea il file di configurazione e mettici un segreto casuale
cp .env.example .env
```

Apri `.env` con un editor e **cambia `SESSION_SECRET`** con una stringa lunga e casuale.
Se hai Node a portata di mano puoi generarne una così:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
(altrimenti inventane una lunga di lettere e numeri).

```bash
# 2) Avvia l'app (la prima volta compila l'immagine: ci mette qualche minuto)
docker compose up -d --build

# 3) Carica le missioni di esempio e crea il PRIMO admin (scegli tu nick e password)
docker compose exec app node src/seed.js
docker compose exec app node src/seed.js admin TUONICK LaTuaPasswordSegreta
```

Ora apri il browser su **http://localhost:3000** 🎉
Accedi con l'admin appena creato: nella barra in alto vedrai **Modera** e **Admin**.

> Per fermare l'app: `docker compose down` · Per riavviarla: `docker compose up -d`
> Per vedere i log in tempo reale: `docker compose logs -f`

---

## 👮 Creare lo staff (moderatori e admin)

1. Le persone del tuo team si **registrano normalmente** dall'app (come utenti).
2. Tu (admin) vai su **Admin → Utenti e ruoli** e le promuovi a **moderator** o **admin**.

- **moderator** = vede la coda delle prove e può **approvare/rifiutare**.
- **admin** = come il moderatore + crea/modifica missioni e gestisce i ruoli.
- Gli utenti `moderator`/`admin` **non compaiono in classifica** (sono organizzatori).

Più moderatori possono lavorare insieme: se due aprono la stessa prova, il primo che
clicca la chiude e il secondo riceve l'avviso *"già gestita da un altro moderatore"*.
Ogni decisione registra **chi** ha approvato/rifiutato e **quando**.

---

## 🎯 Gestire le missioni

Da **Admin** puoi creare missioni con:

- **Titolo** e **descrizione** (puoi usare emoji 🥃🩳📸).
- **Punti**.
- **Richiede foto** sì/no (alcune missioni sono auto-dichiarate).
- **Ripetibile** sì/no (es. *shot con Zio Max* ripetibile; *pantaloncini del 16* una volta sola).
- **Finestra temporale** (facoltativa): la missione è inviabile solo tra `Attiva da` e
  `Attiva fino a`. Formato: `2026-08-16 18:00`. Lascia vuoto per "sempre attiva".

Puoi **archiviare** una missione (sparisce ai giocatori senza cancellare i dati) o
**eliminarla** del tutto.

---

## 🌍 Pubblicare l'app online GRATIS (Cloudflare Tunnel)

Così gli amici ci entrano dal telefono ovunque, con **HTTPS**, **senza aprire porte** sul
router e **senza pagare**.

### Opzione A — Cloudflare Tunnel (consigliata)

1. Installa `cloudflared`:
   - **Mac**: `brew install cloudflared`
   - **Windows**: scarica da https://github.com/cloudflare/cloudflared/releases
   - **Linux**: vedi la pagina release ufficiale.
2. Con l'app già avviata (`docker compose up -d`), in un **nuovo terminale**:

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

3. Cloudflared stampa un indirizzo tipo
   `https://qualcosa-random.trycloudflare.com` → **quello è il link da condividere**.

   ⚠️ Importante: appena l'app è esposta in HTTPS, apri `.env`, metti
   **`SECURE_COOKIES=true`** e riavvia con `docker compose up -d`.
   (Altrimenti il login potrebbe non "ricordarsi" di te.)

> Nota: il link `trycloudflare.com` è gratis ma **temporaneo**: cambia ogni volta che
> riavvii `cloudflared`. Per i pochi giorni della festa va benissimo — basta tenere quel
> terminale aperto. Se vuoi un link fisso serve un dominio collegato a Cloudflare (gratis
> anche quello, ma richiede qualche passaggio in più: chiedi se ti serve).

### Opzione B — ngrok (alternativa di riserva)

```bash
ngrok http 3000
```
Ti dà un URL `https://....ngrok-free.app`. Pro: semplicissimo. Contro: nel piano gratis
mostra una pagina-avviso al primo accesso e ha limiti di traffico più stringenti.
Anche qui: imposta `SECURE_COOKIES=true`.

---

## 💾 Backup dei dati (importante!)

Tutti i dati (utenti, punti, foto) stanno nella cartella **`data/`**:
- `data/fantasanrocco.db` → il database
- `data/uploads/` → le foto caricate

Per fare un backup basta **copiare l'intera cartella `data/`** in un posto sicuro
(chiavetta, altra cartella, cloud personale). Fallo ogni sera durante la festa:

```bash
cp -r data ~/backup-fantasanrocco-$(date +%F)
```

Per ripristinare: rimetti la cartella `data/` al suo posto e riavvia.

---

## 🔒 Note sulla sicurezza

- Le **password** sono salvate con hashing **bcrypt** (mai in chiaro).
- Le **foto-prova sono private**: le vede solo lo staff loggato.
- C'è un **rate limit** sul login per scoraggiare tentativi a tappeto.
- I cookie di sessione sono `httpOnly` + `sameSite=lax` (mitiga il CSRF).
- Tieni segreto il `SESSION_SECRET` nel file `.env` e non committarlo su Git.

Sicurezza "da festa di paese": robusta per lo scopo, non è un sistema bancario. 🙂

---

## ❓ Problemi comuni

- **Il login non resta / mi disconnette**: hai esposto in HTTPS ma `SECURE_COOKIES` è
  ancora `false` (o viceversa sei in locale con `true`). Allinea il valore e riavvia.
- **"port is already allocated"**: la porta 3000 è occupata. Cambia `PORT` in `.env`
  e la riga `ports` in `docker-compose.yml`.
- **Ho dimenticato la password admin**: ricreala con
  `docker compose exec app node src/seed.js admin TUONICK NuovaPassword`
  (se il nick esiste già, ne aggiorna la password e lo rende admin).
- **Voglio azzerare tutto**: ferma l'app, cancella `data/fantasanrocco.db` (e svuota
  `data/uploads/`), riavvia e rilancia il seed. ⚠️ Perdi tutti i dati!

---

Buona festa e che vinca il migliore! 🎆🟠
