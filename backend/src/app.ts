import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { MAX_UPLOAD_SIZE } from "./config/uploads.js";
import { authPlugin } from "./plugins/auth.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import { errorHandler } from "./utils/errors.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { directionRoutes } from "./modules/directions/directions.routes.js";
import { materialRoutes } from "./modules/materials/materials.routes.js";
import { semesterRoutes } from "./modules/semesters/semesters.routes.js";
import { subjectRoutes } from "./modules/subjects/subjects.routes.js";
import { uploadRoutes } from "./modules/uploads/uploads.routes.js";
import { userRoutes } from "./modules/users/users.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: true
  });

  app.setErrorHandler(errorHandler);

  const allowedOrigins = new Set([
    env.PUBLIC_SITE_URL,
    "http://localhost:1313",
    "http://127.0.0.1:1313"
  ]);

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed"), false);
    },
    credentials: true
  });
  await app.register(multipart, {
    limits: {
      fileSize: MAX_UPLOAD_SIZE
    }
  });
  await app.register(rateLimitPlugin);
  await app.register(prismaPlugin);
  await app.register(authPlugin);

  app.get("/api/health", async () => ({ ok: true }));

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(directionRoutes, { prefix: "/api/directions" });
  await app.register(semesterRoutes, { prefix: "/api/semesters" });
  await app.register(subjectRoutes, { prefix: "/api/subjects" });
  await app.register(materialRoutes, { prefix: "/api" });
  await app.register(uploadRoutes, { prefix: "/api/admin/uploads" });
  await app.register(userRoutes, { prefix: "/api/admin/users" });

  return app;
}
