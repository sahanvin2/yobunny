import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:8080,http://localhost:8081"),
  DEV_AUTH_BYPASS: z.coerce.boolean().default(true),
  DEV_AUTH_UID: z.string().default("dev-user-1"),
  DEV_AUTH_EMAIL: z.string().email().default("dev@yobunny.local"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NEXT_PUBLIC_CDN_URL: z.string().url(),
  B2_ENDPOINT: z.string().url(),
  B2_ACCESS_KEY_ID: z.string().min(1),
  B2_SECRET_ACCESS_KEY: z.string().min(1),
  B2_BUCKET: z.string().min(1),
  B2_REGION: z.string().min(1),
  B2_PUBLIC_BASE: z.string().url(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional()
});

export const env = envSchema.parse(process.env);
