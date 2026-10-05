# Supabase setup quick reference

See [README.md](README.md) for the full architecture and deployment checklist.

## Required one-time commands

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy accounts
```

Re-run `supabase functions deploy accounts` after every change to
`supabase/functions/accounts`. If a shipped app action answers
"Unknown account action.", the hosted function is older than the app — deploy
it again. The `deploy-supabase` GitHub workflow does this automatically on
every push to `main` that touches `supabase/functions/**`; to enable it, add
a `SUPABASE_ACCESS_TOKEN` secret and a `SUPABASE_PROJECT_ID` variable or
secret under **Settings → Secrets and variables → Actions**.

**Migrations ship with it.** The same workflow applies migrations through the
Supabase Management API before the function deploys, on any push to `main`
touching `supabase/migrations/**`. That ordering is deliberate: a schema ahead
of the app is harmless, while a UI ahead of its schema is a live button with no
RPC behind it. It uses the existing `SUPABASE_ACCESS_TOKEN` and
`SUPABASE_PROJECT_ID`; no database password is stored in GitHub Actions.

You still need the manual commands above for the **first** setup, before the
workflow has ever run, and `supabase db push` remains safe to run by hand at
any time — migrations are forward-only and the follow-ups are idempotent.

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Unknown account action." | The hosted function is older than the app. | `supabase functions deploy accounts` |
| "…needs a database update that has not been applied…" | A migration has not been pushed. | `supabase db push` |

Either message means a deploy did not finish; check the `deploy-supabase`
workflow run for the merge that shipped the feature.

## Browser environment

Copy `.env.example` to `.env.local` and set only:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Do not add `SUPABASE_SERVICE_ROLE_KEY` to a Vite environment file. It is a
server credential used only by `supabase/functions/accounts`.

## First developer

1. Create an email/password user in Supabase Auth.
2. Insert the matching profile from the SQL editor:

```sql
insert into public.profiles (id, name, role)
values ('AUTH_USER_UUID', 'Station Developer', 'admin');
```

3. Disable **Authentication → Providers → Email → Enable new users**.
4. Sign in at the app’s Developer tab and create the first owner.

## GitHub Pages

Select **GitHub Actions** as the Pages source, then add Actions repository
variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The committed Pages
workflow supplies them to Vite and fails if either is absent.
