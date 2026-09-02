import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { MAX_UPLOAD_SIZE } from "../../config/uploads.js";

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

function isFileTooLarge(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return code === "FST_REQ_FILE_TOO_LARGE" || message.toLowerCase().includes("file size");
}

function formatMegabytes(bytes: number) {
  return Math.floor(bytes / 1024 / 1024);
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
    let file;
    try {
      file = await request.file();
    } catch (error) {
      if (isFileTooLarge(error)) {
        return reply.code(413).send({ message: `Файл слишком большой. Максимум ${formatMegabytes(MAX_UPLOAD_SIZE)} МБ.` });
      }
      throw error;
    }

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

    try {
      await pipeline(file.file, createWriteStream(path));
    } catch (error) {
      if (isFileTooLarge(error)) {
        return reply.code(413).send({ message: `Файл слишком большой. Максимум ${formatMegabytes(MAX_UPLOAD_SIZE)} МБ.` });
      }
      throw error;
    }

    return {
      url: `/api/admin/uploads/${filename}`,
      filename,
      originalName: file.filename,
      mimeType: file.mimetype
    };
  });
}
