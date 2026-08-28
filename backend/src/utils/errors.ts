import { Prisma } from "@prisma/client";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export function errorHandler(error: FastifyError, _request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      message: "Некорректные данные",
      issues: error.issues
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return reply.code(409).send({ message: "Такая запись уже существует" });
    }

    if (error.code === "P2025") {
      return reply.code(404).send({ message: "Запись не найдена" });
    }
  }

  const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

  return reply.code(statusCode).send({
    message: statusCode === 500 ? "Внутренняя ошибка сервера" : error.message
  });
}
