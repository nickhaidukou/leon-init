# Local Docker Development

Last updated: 2026-03-05

This guide starts local infrastructure with Docker Compose for:
- PostgreSQL (`localhost:5432`)
- Redis (`localhost:6379`)
- MinIO S3-compatible storage (`localhost:9000`, console `localhost:9001`)

## 1. Start Infrastructure

From repository root:

```bash
docker compose up -d
```

Check status:

```bash
docker compose ps
```

## 2. Prepare App Environment Files

Use the local example values from [.env.compose.example](/Users/nick/Cursor/midday/.env.compose.example).

Create app env files:

```bash
cp apps/api/.env-template apps/api/.env
cp apps/dashboard/.env-example apps/dashboard/.env.local
cp apps/worker/.env-template apps/worker/.env
```

At minimum, set these values in all app env files where relevant:
- `DATABASE_PRIMARY_URL=postgresql://midday:midday@localhost:5432/midday`
- `DATABASE_PRIMARY_POOLER_URL=postgresql://midday:midday@localhost:5432/midday`
- `DATABASE_SESSION_POOLER=postgresql://midday:midday@localhost:5432/midday`
- `REDIS_URL=redis://localhost:6379`
- `REDIS_QUEUE_URL=redis://localhost:6379`
- `S3_BUCKET=midday-local`
- `AWS_REGION=us-east-1`
- `S3_ENDPOINT=http://localhost:9000`
- `S3_FORCE_PATH_STYLE=true`
- `AWS_ACCESS_KEY_ID=midday`
- `AWS_SECRET_ACCESS_KEY=midday123`

Dashboard/API URL values:
- `NEXT_PUBLIC_URL=http://localhost:3001`
- `NEXT_PUBLIC_API_URL=http://localhost:3003`
- `NEXT_PUBLIC_REALTIME_URL=ws://localhost:3003/realtime`
- `API_INTERNAL_URL=http://localhost:3003`

Auth values (required for real login):
- `ZITADEL_ISSUER`
- `ZITADEL_CLIENT_ID`
- `ZITADEL_CLIENT_SECRET`
- `ZITADEL_AUDIENCE`

## 3. Start Apps

Run in separate terminals:

```bash
bun run dev:api
bun run dev:dashboard
cd apps/worker && bun run dev
```

Default local URLs:
- Dashboard: `http://localhost:3001`
- API: `http://localhost:3003`
- Worker health: `http://localhost:8080/health`

## 4. Stop/Clean

Stop infra:

```bash
docker compose down
```

Stop infra and delete volumes:

```bash
docker compose down -v
```
