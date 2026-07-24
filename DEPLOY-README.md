# AirText v1 — Quick Edit Deploy Checklist

## What you're deploying

`airtext-worker-modern.js` — a single self-contained Cloudflare Worker.
No npm, no build step, no Wrangler needed. Paste → Save → Live.

---

## Cloudflare Dashboard Setup (do this once)

### 1. Create a D1 database

Dashboard → Storage & Databases → D1 SQL → Create database
- Name: `airtext`
- Note the **database ID** shown after creation

### 2. Create an R2 bucket (file sharing)

Dashboard → Storage & Databases → R2 → Create bucket
- Name: `airtext-files`
- R2 is required only for file sharing — the rest of the site works without it

### 3. Create your Worker

Dashboard → Compute (Workers) → Workers → Create
- Give it a name (e.g. `airtext`)
- Click **Edit Code** → paste the contents of `airtext-worker-modern.js`
- Click **Deploy**

### 4. Add Bindings

Worker → Settings → Bindings → Add binding for each of these:

| Type | Variable name | Value |
|---|---|---|
| D1 Database | `DB` | select the `airtext` database |
| R2 Bucket | `FILES_BUCKET` | select `airtext-files` |
| Secret | `APP_SECRET` | generate 32+ random characters (e.g. use https://1password.com/password-generator/) |
| Secret | `ADMIN_PASSWORD` | your chosen admin panel password |

After adding all four bindings, **re-deploy** the Worker (Edit Code → Deploy again).

### 5. Initialize the schema

The Worker creates all D1 tables automatically on the first HTTP request —
just visit your Worker URL once and the schema is set up.

Visit: `https://your-worker.workers.dev/`

Done. The admin panel is at: `https://your-worker.workers.dev/admin`

---

## Staging Worker (Recommended)

Create a second Worker (e.g. `airtext-staging`) with its own separate D1
database (`airtext-staging`) and R2 bucket (`airtext-files-staging`).

Test every change in staging before pasting it into production.
Cloudflare keeps the last 10 deployed versions per Worker — you can roll
back from the **Deployments** tab if something goes wrong.

---

## After First Deploy — Admin Panel Checklist

1. Go to `/admin` → enter your `ADMIN_PASSWORD`
2. **Settings tab** → fill in: site name, tagline, your developer name/bio
3. **Settings → SEO** → set site title, meta description, canonical URL
4. **Settings → File sharing** → confirm max file size and storage cap match
   your R2 free tier expectations (10GB free on R2)
5. **Settings → Danger zone** → confirm Maintenance mode is OFF

---

## File Sharing — Quick Limits Reference

All of these are editable live from the admin panel without redeploying:

| Setting | Default | Admin path |
|---|---|---|
| File sharing enabled | ✅ on | Settings → File sharing limits |
| Max file size | 25 MB | Settings → File sharing limits |
| Total storage cap | 500 MB | Settings → File sharing limits |
| File retention | 1 hour | Settings → File sharing limits |
| Upload cooldown | 6 seconds | Settings → File sharing limits |
| Blocked extensions | exe, bat, cmd, msi, scr, dll, jar, ps1, vbs, apk, ... | Settings → File sharing limits |

---

## Updating the Worker

1. Edit `airtext-worker-modern.js` locally
2. Dashboard → your Worker → Edit Code
3. Select all, paste the new file, Deploy
4. Cloudflare saves the previous version automatically — rollback via Deployments tab

---

## Data Safety Notes

- D1 notes and files metadata are stored in your D1 database
- Actual file bytes are stored in your R2 bucket under `files/<id>`
- Expired notes are deleted from D1 by the built-in cleanup job (runs every 30 minutes)
- Expired files are deleted from both D1 **and** R2 by the same cleanup job
- The admin Files tab shows current R2 usage vs your configured cap
- For backup: D1 → Dashboard → your database → Export (SQL dump)
