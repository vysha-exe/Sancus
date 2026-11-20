# Team secrets (hackathon)

Do **not** commit real API keys. Keep them only in your local `app/.env.local` (gitignored).

## Setup

1. Copy `app/.env.example` to `app/.env.local`
2. Fill in keys from the team password manager / secure channel (not from git)
3. `cd app && npm run dev`

If you previously used a tracked `secrets/env.team`, that file has been removed from the repo. Use your local backup or rotate and re-issue keys.

## Warning

If keys were ever pushed to git (even a private repo), **rotate them** in Circle, Supabase, Marqeta, Omise, Midtrans, and any other providers.
