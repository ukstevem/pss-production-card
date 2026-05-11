# AI assistant — read me first

You are working on **pss-production-card**, a PSS standalone app being built fresh (greenfield) to replace the paper jobcard / traveller.

## First steps every session

1. Run `bd prime` — this project uses **beads (bd)** for task tracking.
2. Read `docs/ARCHITECTURE.md` end-to-end. It contains every locked decision from the initial design grill (2026-05-11). When in doubt about a behaviour, that doc is authoritative.
3. Read `../platform-portal/docs/NEW_STANDALONE_APP.md` for scaffold templates (Dockerfile, docker-compose.app.yml, next.config.ts, .dockerignore, build.sh).
4. App identity:
   - Port `3014`, service / container `production-card`, basePath `/production-card`
   - Image `ghcr.io/ukstevem/production-card`
   - Hosted behind the shared `platform_net` network, fronted by `gateway` nginx

## Tooling rules

- Use `bd create` / `bd update --claim` / `bd close` for task tracking. Do NOT use `TodoWrite` or markdown TODO lists.
- Use `bd remember` for persistent insights. Do NOT use `MEMORY.md` files.
- Session close protocol: `git status` → `git add` → `git commit` → `git push` → `bd dolt push`. Work isn't done until pushed.
- For any non-trivial change that crosses files or touches invariants (port, basePath, platform_net, env files, registers, lifecycle, dual-signoff rules) — use `/grill-me` first, file a `bd` issue with the agreed plan, then start work.

## Reference apps

- `../pss-matl-cert/` and `../pss-assembly-viewer/` — standalone app patterns (mirror these)
- `../pss-employee-presence/` — RFID kiosk + firmware pattern (we reuse `employee_cards`; our events table is separate)
- `../pss-document-service/` — 61355 numbering + PDF archive (we POST traveller PDFs here on issue)

## Hard invariants — don't break

- **Port 3014, service `production-card`, basePath `/production-card`** all agree.
- **Never** rename the docker service or container — nginx resolves it by name.
- **Never** commit `.env` or `.env.*.local`. `.env.example` is the only env file committed.
- **Build-time `NEXT_PUBLIC_*` vars** must be passed as Docker `--build-arg` (not just `environment:`). Changing them requires rebuild.
- **`.dockerignore` mandatory** at `app/.dockerignore` once Next.js scaffold lands — excludes host `node_modules` and `.next`.
- **Doc lifecycle is immutable on close** — only NCR or formal amendment can change records.
- **Segregation of duties** — same person can't operate AND accept the same op; same person can't issue AND final-inspect the same card.
