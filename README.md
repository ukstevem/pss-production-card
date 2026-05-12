# pss-production-card

Digital production traveller for items moving through the workshop and through site installation. Replaces the paper jobcard. Captures contemporaneous evidence of welds, signoffs, and inspections so the EN 1090 audit trail is built as work happens.

> Architecture and end-state design: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). All locked decisions live there.
> Work tracking: `bd ready` (this repo uses **beads**, not GitHub issues, as the source of truth).

## Port + routing

| Thing | Value |
|---|---|
| Port | `3014` |
| Service / container | `production-card` |
| basePath | `/production-card` |
| Public URL (LAN) | `http://10.0.0.75:3000/production-card/` |
| Image | `ghcr.io/ukstevem/pss-production-card` |

## Local development

```bash
cd app/
cp ../.env.example .env.local   # fill in dev values
npm install
npm run dev                      # http://localhost:3014/production-card/
```

## Build + push to ghcr.io

```bash
./build.sh
```

Builds an ARM64 image from `app/`, baking in the `NEXT_PUBLIC_*` vars from `../platform-portal/.env`, and pushes `:<sha>` and `:latest` tags. Never run on the Pi — it runs out of memory. Build on a dev machine.

## Deploy on the Pi

```bash
ssh pi@10.0.0.75
cd /opt/pss-production-card           # (one-time: git clone here)
git pull
docker compose -f docker-compose.app.yml pull
docker compose -f docker-compose.app.yml up -d
```

The gateway nginx (port 3000 on the Pi) proxies `/production-card/` to `http://10.0.0.75:3014`. No gateway restart needed unless the route definition changed in `platform-portal/docker/nginx/production.conf`.

## Roll back

Edit `docker-compose.app.yml`:

```yaml
image: ghcr.io/ukstevem/pss-production-card:<previous-sha>
```

Then `docker compose -f docker-compose.app.yml up -d`.

## Repo layout

```
pss-production-card/
├── app/                            Next.js 16 app (app router)
│   ├── app/                        routes + layout
│   ├── components/                 app-specific React components
│   ├── packages/                   frozen copies of @platform/{ui,auth,supabase}
│   ├── public/
│   ├── Dockerfile                  multi-stage, runs as non-root
│   ├── .dockerignore               mandatory
│   ├── next.config.ts              basePath /production-card
│   └── package.json
├── docker-compose.app.yml          production stack, joins platform_net
├── build.sh                        buildx → ghcr.io
├── docs/
│   └── ARCHITECTURE.md             end-state design (the spec)
├── assets/                         reference data: existing card, WPS register, consumables export
├── .env.example                    env var template
└── .beads/                         beads issue tracker (source of truth for tasks)
```
