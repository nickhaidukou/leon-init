# Kubernetes Configuration Guide (Zitadel + S3 + PostgreSQL)

Last updated: 2026-03-05

## Purpose
This document is the deployment baseline for running Midday on Kubernetes without Supabase runtime dependencies.

Target runtime stack:
- Auth: Zitadel (OIDC/JWT)
- Relational DB: PostgreSQL (self-hosted in Kubernetes)
- File storage: AWS S3
- Queue/cache: Redis
- Realtime: WebSocket endpoint (with dashboard polling fallback)

## Workload Topology

| Component | Kind | Default Port | Probe Path |
| --- | --- | --- | --- |
| `dashboard` (`apps/dashboard`) | Deployment + Service + Ingress | `3000` | `/api/health` |
| `api` (`apps/api`) | Deployment + Service + Ingress | `8080` | `/health`, `/health/ready` |
| `worker` (`apps/worker`) | Deployment (+ optional Service) | `8080` | `/health`, `/health/ready` |
| `postgres` | Stateful HA cluster | `5432` | operator-specific |
| `redis` | StatefulSet or managed Redis | `6379` | `PING` |

## Required Cluster Add-ons
- Ingress controller (`ingress-nginx` or equivalent)
- `cert-manager` (if using managed TLS certs)
- `metrics-server` (for HPA)
- Optional: `keda` (worker autoscaling by queue depth)

## Configuration Model

Use:
- `ConfigMap` for non-sensitive values.
- `Secret` for credentials and signing keys.

### Minimum Required Environment Variables

API:
- `ZITADEL_ISSUER`
- `ZITADEL_AUDIENCE` (recommended)
- `DATABASE_PRIMARY_URL`
- `REDIS_URL`
- `REDIS_QUEUE_URL`
- `S3_BUCKET`
- `AWS_REGION`

Dashboard:
- `ZITADEL_ISSUER`
- `ZITADEL_CLIENT_ID`
- `ZITADEL_CLIENT_SECRET`
- `NEXT_PUBLIC_URL`
- `NEXT_PUBLIC_API_URL`
- `APP_SESSION_SECRET`
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (must be identical across all dashboard replicas)

Worker:
- `DATABASE_PRIMARY_POOLER_URL` (or `DATABASE_PRIMARY_URL`)
- `REDIS_QUEUE_URL`
- `ZITADEL_ISSUER`
- `S3_BUCKET`
- `AWS_REGION`

Shared/important:
- `S3_ENDPOINT` (optional)
- `S3_FORCE_PATH_STYLE`
- `S3_PUBLIC_BASE_URL` (optional)
- `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (if not using IAM roles)

## Starter Manifests

### Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: midday
```

### Shared ConfigMap (example)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: midday-config
  namespace: midday
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  AWS_REGION: "us-east-1"
  S3_FORCE_PATH_STYLE: "false"
  NEXT_PUBLIC_URL: "https://app.example.com"
  NEXT_PUBLIC_API_URL: "https://api.example.com"
  NEXT_PUBLIC_REALTIME_URL: "wss://api.example.com/realtime"
  ALLOWED_API_ORIGINS: "https://app.example.com"
```

### API Deployment + Service (example)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: midday-api
  namespace: midday
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels:
      app: midday-api
  template:
    metadata:
      labels:
        app: midday-api
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: api
          image: ghcr.io/<org>/midday-api:<tag>
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: midday-config
            - secretRef:
                name: midday-api-secret
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 20
            periodSeconds: 20
          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"
            limits:
              cpu: "1"
              memory: "1Gi"
---
apiVersion: v1
kind: Service
metadata:
  name: midday-api
  namespace: midday
spec:
  selector:
    app: midday-api
  ports:
    - name: http
      port: 80
      targetPort: 8080
```

### Dashboard Deployment + Service (example)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: midday-dashboard
  namespace: midday
spec:
  replicas: 3
  selector:
    matchLabels:
      app: midday-dashboard
  template:
    metadata:
      labels:
        app: midday-dashboard
    spec:
      terminationGracePeriodSeconds: 45
      containers:
        - name: dashboard
          image: ghcr.io/<org>/midday-dashboard:<tag>
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: midday-config
            - secretRef:
                name: midday-dashboard-secret
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 20
            periodSeconds: 20
---
apiVersion: v1
kind: Service
metadata:
  name: midday-dashboard
  namespace: midday
spec:
  selector:
    app: midday-dashboard
  ports:
    - name: http
      port: 80
      targetPort: 3000
```

### Worker Deployment (example)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: midday-worker
  namespace: midday
spec:
  replicas: 2
  selector:
    matchLabels:
      app: midday-worker
  template:
    metadata:
      labels:
        app: midday-worker
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: worker
          image: ghcr.io/<org>/midday-worker:<tag>
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: midday-config
            - secretRef:
                name: midday-worker-secret
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 20
            periodSeconds: 20
```

### Ingress (dashboard + API + realtime path)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: midday-ingress
  namespace: midday
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - app.example.com
        - api.example.com
      secretName: midday-tls
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: midday-dashboard
                port:
                  number: 80
    - host: api.example.com
      http:
        paths:
          - path: /realtime
            pathType: Prefix
            backend:
              service:
                name: midday-api
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: midday-api
                port:
                  number: 80
```

## PostgreSQL Setup (Kubernetes)

Recommended:
- Use a PostgreSQL operator with HA (for example CloudNativePG).
- Run at least 3 instances for production.
- Enable automated backups (object storage).
- Enable `pg_trgm` extension (required by existing migrations).
- Use a pooler endpoint for workers (`DATABASE_PRIMARY_POOLER_URL`).

Connection string targets:
- `DATABASE_PRIMARY_URL` -> PostgreSQL writer service
- `DATABASE_PRIMARY_POOLER_URL` -> PgBouncer/Pooler service
- `DATABASE_FRA_URL`, `DATABASE_SJC_URL`, `DATABASE_IAD_URL` -> set to primary initially if single-region

Important:
- In `NODE_ENV=production`, DB clients use SSL options. Ensure PostgreSQL/pooler endpoints accept TLS in production.

## Redis Setup

Minimum:
- `REDIS_URL` for cache features (API/dashboard).
- `REDIS_QUEUE_URL` for BullMQ (API/worker).

For first cutover:
- Same Redis instance is acceptable (different URLs can point to same host).
- Better isolation later: dedicated queue Redis and cache Redis.

## Database Migrations

Run migrations as a one-off Kubernetes Job before first app rollout:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: midday-db-migrate
  namespace: midday
spec:
  backoffLimit: 1
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: ghcr.io/<org>/midday-api:<tag>
          workingDir: /app
          command:
            - bunx
            - drizzle-kit
            - migrate
            - --config
            - /app/packages/db/drizzle.config.ts
          envFrom:
            - secretRef:
                name: midday-api-secret
```

This job requires `DATABASE_SESSION_POOLER` in the referenced secret.

## Rollout Order
1. Install cluster add-ons (Ingress, cert-manager, metrics-server).
2. Provision PostgreSQL + pooler + Redis.
3. Apply `ConfigMap` and `Secret` objects.
4. Run DB migration job.
5. Deploy API.
6. Deploy worker.
7. Deploy dashboard.
8. Apply Ingress and DNS.
9. Run smoke tests.

## Smoke Tests

```bash
curl -f https://api.example.com/health
curl -f https://api.example.com/health/ready
curl -f https://app.example.com/api/health
```

Validate no runtime Supabase imports:

```bash
rg -n "@supabase/|@midday/supabase" apps/api apps/dashboard apps/worker packages --glob '!**/*.md' --glob '!**/*.mdx'
```

## Realtime Note

Dashboard expects a WebSocket endpoint at `/realtime` (or `NEXT_PUBLIC_REALTIME_URL`).  
If the WS backend is temporarily unavailable, dashboard hooks fall back to polling where fallback callbacks are implemented.
