import fp from "fastify-plugin";
import admin from "firebase-admin";
import { env } from "../config.js";

declare module "fastify" {
  interface FastifyInstance {
    firebaseAdmin: admin.app.App | null;
  }
}

export default fp(async (fastify) => {
  if (env.DEV_AUTH_BYPASS) {
    fastify.decorate("firebaseAdmin", null);
    return;
  }

  if (!admin.apps.length && env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
      })
    });
  }

  fastify.decorate("firebaseAdmin", admin.apps.length ? admin.app() : null);
});
