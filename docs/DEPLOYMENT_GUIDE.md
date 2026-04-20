# YoBunny Deployment Guide

This guide deploys the app in production with:
- Frontend (Vite static build)
- API (Fastify + Prisma)
- PostgreSQL + Redis
- Nginx reverse proxy + TLS

## 1. Server Requirements

- Ubuntu 22.04+ (recommended)
- 4+ vCPU, 8+ GB RAM (16 GB recommended for heavy video traffic)
- Node.js 20 LTS
- npm 10+
- Docker + Docker Compose
- Nginx
- Domain name with DNS pointing to server

## 2. Clone and Install

```bash
cd /opt
git clone <YOUR_REPO_URL> yobunny
cd yobunny
npm install
cd apps/api && npm install && cd ../..
```

## 3. Environment Variables

Create these files:

- Root frontend env: `.env`
- API env: `apps/api/.env`

### 3.1 Root `.env` (Frontend)

```env
VITE_API_URL=https://api.your-domain.com/api
NEXT_PUBLIC_API_URL=https://api.your-domain.com/api
NEXT_PUBLIC_CDN_URL=https://cdn.your-domain.com
```

### 3.2 `apps/api/.env` (Backend)

```env
NODE_ENV=production
PORT=4000
HOST=0.0.0.0

DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5434/yobunny?schema=public
REDIS_URL=redis://127.0.0.1:6380

# Storage and media
B2_KEY_ID=...
B2_APPLICATION_KEY=...
B2_BUCKET=...
B2_REGION=...
CDN_URL=https://cdn.your-domain.com

# Auth
DEV_AUTH_BYPASS=false
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## 4. Start Data Services (Postgres/Redis)

From repo root:

```bash
docker compose up -d
```

Validate:

```bash
docker ps
```

## 5. Prepare Database

```bash
cd apps/api
npm run prisma:generate
npm run prisma:push
npm run setup:storage-db
cd ../..
```

## 6. Build Frontend and API

```bash
npm run build
npm --prefix apps/api run build
```

## 7. Run API with PM2

Install PM2 globally:

```bash
npm install -g pm2
```

Start API:

```bash
cd /opt/yobunny/apps/api
pm2 start dist/server.js --name yobunny-api
pm2 save
pm2 startup
```

## 8. Serve Frontend with Nginx

Frontend build output is in `dist/`.

Create Nginx config at `/etc/nginx/sites-available/yobunny`:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    root /opt/yobunny/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/yobunny /etc/nginx/sites-enabled/yobunny
sudo nginx -t
sudo systemctl reload nginx
```

## 9. Enable HTTPS (Let’s Encrypt)

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

## 10. Health and Smoke Checks

```bash
curl -s http://127.0.0.1:4000/health
curl -s https://your-domain.com
curl -s https://your-domain.com/api/videos?limit=3
```

## 11. Deploy Updates

```bash
cd /opt/yobunny
git pull
npm install
cd apps/api && npm install && cd ../..
npm run build
npm --prefix apps/api run build
npm --prefix apps/api run prisma:push
pm2 restart yobunny-api
sudo systemctl reload nginx
```

## 12. Performance and Stability Checklist

- Keep API paging enabled on feed/list endpoints.
- Use CDN for thumbnails and HLS segments.
- Ensure `DEV_AUTH_BYPASS=false` in production.
- Set Nginx gzip/brotli and long cache headers for static assets.
- Monitor memory with `pm2 monit` and set restart threshold if needed.

## 13. Troubleshooting

### App shows no videos

1. Check API health: `curl http://127.0.0.1:4000/health`
2. Check API data: `curl "http://127.0.0.1:4000/api/videos?limit=5"`
3. Verify frontend env points to correct API URL.
4. Rebuild frontend after env changes: `npm run build`.

### 502 from Nginx

- API process is down or wrong upstream port.
- Check `pm2 logs yobunny-api` and `/var/log/nginx/error.log`.

### Prisma errors

- Validate `DATABASE_URL` and Postgres container status.
- Re-run `npm --prefix apps/api run prisma:push`.
