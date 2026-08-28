import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";

const allowedExtensions = new Set([".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".webp", ".zip"]);

function safeFileName(name: string) {
  const ext = extname(name).toLowerCase();
  const base = basename(name, ext).replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, "-").slice(0, 80);
  return `${Date.now()}-${base || "file"}${ext}`;
}

export async function uploadRoutes(app: FastifyInstance) {
  app.post("/", { preHandler: app.authenticate }, async (request, reply) => {
    const file = await request.file();

    if (!file) {
      return reply.code(400).send({ message: "Файл не передан" });
    }

    const ext = extname(file.filename).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      return reply.code(400).send({ message: "Недопустимый тип файла" });
    }

    await mkdir(env.UPLOAD_DIR, { recursive: true });

    const filename = safeFileName(file.filename);
    const path = join(env.UPLOAD_DIR, filename);

    await pipeline(file.file, createWriteStream(path));

    return {
      url: `/uploads/${filename}`,
      filename,
      originalName: file.filename,
      mimeType: file.mimetype
    };
  });
}
