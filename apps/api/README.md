# YoBunny API (Fastify + Prisma)

## 1) Setup

1. Copy `.env.example` to `.env`.
2. Fill Firebase fields and storage secrets.
3. Run local services from repo root:

   docker compose up -d

4. Install dependencies:

   npm install
   cd apps/api
   npm install

5. Generate Prisma client and push schema:

   npm run prisma:generate
   npm run prisma:push

6. Start API:

   npm run dev

API health check: `GET http://localhost:4000/health`

## Notes

- Uses your CDN base URL in env validation.
- Upload URL route creates pre-signed B2 URLs.
- Transcoding worker file is scaffolded; implement Bull + FFmpeg as next step.
