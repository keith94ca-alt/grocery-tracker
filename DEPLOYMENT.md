# Deployment Guide

## Test Environment (ss.keithkas.cc)

### Webhook Deploy
After pushing code to the `overnight` branch, trigger a deploy:
```bash
curl -s "https://n8n.keithkas.cc/webhook/grocery-test"
```
Wait for the response — it returns the stack metadata including the new `ConfigHash` (commit hash). Then verify at **ss.keithkas.cc**.

### What It Does
- Portainer detects the git push to `overnight`
- Pulls latest code from GitHub
- Rebuilds the Docker container via `docker-compose-test.yml`
- Restarts the container

### Branch Configuration
- Test env pulls from: `refs/heads/overnight`
- Config file: `docker-compose-test.yml`
- If changing branches, Keith needs to update Portainer config manually

## Production (prices.keithkas.cc)

### Deploy Flow
1. Merge `overnight` → `main` on GitHub
2. Keith manually redeploys via Portainer UI
3. Production uses `docker-compose.yml` (not test)
4. Production database: `/data/prices.db` (persistent volume)

### Database Migrations
Migrations run automatically on container start via `docker-entrypoint.sh`:
```bash
npx prisma migrate deploy
```
No manual migration steps needed.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:/data/prices.db` | SQLite path (Docker volume) |
| `NODE_ENV` | `production` | Set in Dockerfile |
| `FLIPP_POSTAL_CODE` | `N2B3J1` | Postal code for flyer store filtering |

## Docker Files

- **`Dockerfile`** — Multi-stage build (node:20-alpine), production only
- **`docker-compose.yml`** — Production (no port mapping, Cloudflare Tunnel)
- **`docker-compose-test.yml`** — Test environment
- **`docker-entrypoint.sh`** — Runs migrations then starts app

## Troubleshooting

### Container won't start
Check logs: `docker logs grocery-tracker-test`
Common: database locked (SQLite), port conflict (7800)

### Flyer data empty
The Flipp API is rate-limited. The flyer-items route caches results until Thursday 6 AM ET. If empty, wait and retry.

### Database issues
SQLite file is at `/data/prices.db` (production). To backup: `docker cp <container>:/data/prices.db ./backup.db`
