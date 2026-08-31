import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";

const allowedExtensions = new Set([".pdf", ".doc", ".docx", ".odt", ".md", ".png", ".jpg", ".jpeg", ".webp", ".zip", ".ppt", ".pptx", ".apkg"]);

const mimeTypes = new Map([
  [".pdf", "application/pdf"],
  [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".odt", "application/vnd.oasis.opendocument.text"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".zip", "application/zip"],
  [".ppt", "application/vnd.ms-powerpoint"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  [".apkg", "application/octet-stream"]
]);

function safeFileName(name: string) {
  const ext = extname(name).toLowerCase();
  const base = basename(name, ext).replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, "-").slice(0, 80);
  return `${Date.now()}-${base || "file"}${ext}`;
}

export async function uploadRoutes(app: FastifyInstance) {
  app.get("/:filename", async (request, reply) => {
    const { filename } = request.params as { filename: string };
    const safeName = basename(filename);
    if (safeName !== filename) {
      return reply.code(400).send({ message: "Некорректное имя файла" });
    }

    const path = join(env.UPLOAD_DIR, safeName);
    try {
      await stat(path);
    } catch (_error) {
      return reply.code(404).send({ message: "Файл не найден" });
    }

    const ext = extname(safeName).toLowerCase();
    return reply.type(mimeTypes.get(ext) || "application/octet-stream").send(createReadStream(path));
  });

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
      url: `/api/admin/uploads/${filename}`,
      filename,
      originalName: file.filename,
      mimeType: file.mimetype
    };
  });
}
