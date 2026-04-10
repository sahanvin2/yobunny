# YoBunny - Video Platform

A full-stack video sharing platform with Vite React frontend and Fastify backend.

## ⚡ Quick Start

### Step 1: Start Infrastructure
```bash
docker compose up -d
```
Starts PostgreSQL (port 5434) and Redis (port 6380).

### Step 2: Start Backend (Terminal 1)
```bash
cd apps/api
npm install
npm run prisma:push
npm run dev
```
✅ Backend runs on: [http://localhost:4000/api](http://localhost:4000/api)

### Step 3: Start Frontend (Terminal 2)
```bash
npm install
npm run dev
```
✅ Frontend runs on: [http://localhost:8080](http://localhost:8080)

## 🎯 Access the Application

Once both servers are running:

- **Main Site**: [http://localhost:8080](http://localhost:8080)
- **API**: [http://localhost:4000/api](http://localhost:4000/api)
- **Upload Video**: [http://localhost:8080/upload](http://localhost:8080/upload)
- **Dashboard**: [http://localhost:8080/dashboard](http://localhost:8080/dashboard)

## 📋 Prerequisites

- **Node.js**: 18+
- **Docker & Docker Compose**: For local PostgreSQL and Redis
- **npm**: Package manager

## Project Structure

```
├── apps/api/              # Fastify backend with Prisma ORM
│   ├── src/
│   │   ├── server.ts      # Fastify setup
│   │   ├── routes/        # API endpoints
│   │   ├── services/      # Business logic (B2, storage, etc)
│   │   └── middleware/    # Auth, logging
│   └── prisma/            # Database schema
├── src/                   # Vite React frontend
│   ├── pages/             # Route pages
│   ├── components/        # React components
│   ├── lib/               # API client, utilities
│   └── hooks/             # Custom React hooks
└── public/                # Static assets (logo, favicon, robots.txt)
```

## Features

- 🎬 Upload videos with B2 storage
- ▶️ Watch videos with streaming
- 💬 Comments and interactions
- ❤️ Like and save videos
- 📊 Creator dashboard with analytics
- 🔍 Search and discover videos
- 📱 Fully responsive design

## Environment Variables

Both frontend and backend use `.env` files:

**Backend** (`apps/api/.env`):
- `DATABASE_URL`: PostgreSQL connection
- `REDIS_URL`: Redis connection
- `B2_*`: Backblaze B2 credentials
- `DEV_AUTH_BYPASS`: Skip Firebase auth for development

**Frontend** (`.env`):
- `NEXT_PUBLIC_API_URL`: Backend API URL
- `NEXT_PUBLIC_CDN_URL`: CDN for video streaming

## Common Commands

**Backend**:
```bash
cd apps/api
npm run dev          # Development server
npm run build        # Production build
npm run prisma:push  # Sync database schema
npm run prisma:studio # Database GUI
node scripts/report-metrics.mjs # Videos, DB size, table rows/columns, B2 usage
```

**Frontend**:
```bash
npm run dev          # Development server with hot reload
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

## Debugging

**Backend logs**: Check terminal output when running `npm run dev` - all requests logged with JSON format

**Frontend logs**: Browser DevTools Console (F12)

**Database**: 
```bash
cd apps/api
npm run prisma:studio
```

## Security Note

Do not commit real secrets (B2 keys, Firebase credentials, API keys).
Use `.env` files locally and rotate any exposed keys immediately.

## 5) What Is Implemented In API

- Prisma schema with the requested core models
- Firebase token middleware (`requireAuth`)
- Auth routes
- Video routes (listing, search, single video, upload URL, like/save/watch)
- Comment + reply routes
- User routes (profile, subscribe, history, saved, dashboard, notifications)
- Search route
- Redis-backed recommendation cache scaffold
- B2 pre-signed upload URL service

## 6) Next Steps

- Add Bull queue + BullBoard
- Implement full FFmpeg transcoding worker
- Add Socket.io real-time events
- Migrate frontend from Vite to Next.js App Router for SEO
