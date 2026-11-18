# Team secrets (hackathon)

This folder holds the shared env file for the private Sancus repo so teammates can run the app without pasting keys around.

## Setup

```bash
cp secrets/env.team app/.env.local
cd app && npm run dev
```

`app/.env.local` stays gitignored. Edit your local copy freely; when the team keys change, update `secrets/env.team` and push.

## Warning

These are **real sandbox/test keys**. The GitHub repo is private. If it is ever made public, or someone leaves the team, **rotate every key** in Circle, Supabase, Marqeta, Omise, and Midtrans.
