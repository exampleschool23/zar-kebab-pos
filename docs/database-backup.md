# Nightly database backup

A GitHub Actions workflow (`.github/workflows/db-backup.yml`) dumps the Supabase
`public` and `auth` schemas every night at 23:17 UTC (04:17 Asia/Tashkent, after late
service), encrypts the dump with [age](https://github.com/FiloSottile/age), uploads it
to a private Cloudflare R2 bucket and deletes dumps older than 14 days
(`BACKUP_RETENTION_DAYS`). The dump covers orders, payments, accounting, payroll,
catalog history and staff accounts, so restored users can still sign in.

## One-time setup

1. **age key pair.** Run `age-keygen -o zar-kebab-age-key.txt`. The public key
   (`age1...`) goes into GitHub; keep the key file in your password manager and nowhere
   else. Without it the backups cannot be read.
2. **R2 bucket.** Create a new **private** bucket (not the public menu-image bucket),
   then an R2 API token with Object Read & Write limited to that bucket. Note the
   account ID.
3. **Supabase connection string.** Project Settings → Database → Connection string →
   Session pooler (the direct host is IPv6-only and GitHub runners cannot reach it).
4. **GitHub secrets** (Repo → Settings → Secrets and variables → Actions):
   `SUPABASE_DB_URL`, `AGE_PUBLIC_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. These are GitHub-only and separate from the
   Vercel menu-image `R2_*` variables. Optional failure alerts: `TELEGRAM_BOT_TOKEN`
   and `BACKUP_ALERT_CHAT_ID`.
5. Run the workflow once from the Actions tab (Run workflow) and confirm a file appears
   in the bucket.

## Restore (test it once on a scratch database)

Create an empty scratch Postgres or Supabase project, download a dump from R2, then:

```bash
AGE_IDENTITY_FILE=zar-kebab-age-key.txt scripts/db-restore.sh db-2026-10-01T231700Z.dump.age "postgresql://scratch-url"
```

Needs `age` and a `pg_restore` of the same major version as the server. Restoring
into the live database overwrites it; do that only in a real disaster.

## Notes

- GitHub pauses scheduled workflows after 60 days without repository activity.
- Menu images live in R2, not in the database dump; back that bucket up separately if
  needed. Supabase cron jobs, extensions and Vault secrets are not in `public`/`auth`
  and must be re-created from `supabase/` migrations and README setup after a restore.
- Rotating the age key does not re-encrypt old dumps; keep old private keys.
