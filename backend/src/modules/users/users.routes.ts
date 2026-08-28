import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { writeAuditLog } from "../audit/audit.service.js";
import { userCreateSchema, userUpdateSchema } from "./users.schemas.js";

const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
} as const;

export async function userRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireAdmin }, async () => {
    return app.prisma.user.findMany({
      select: publicUserSelect,
      orderBy: [{ role: "asc" }, { name: "asc" }]
    });
  });

  app.post("/", { preHandler: app.requireAdmin }, async (request, reply) => {
    const input = userCreateSchema.parse(request.body);
    const user = await app.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: await argon2.hash(input.password),
        name: input.name,
        role: input.role
      },
      select: publicUserSelect
    });

    await writeAuditLog(app.prisma, {
      userId: request.user.id,
      action: "user.create",
      entityType: "user",
      entityId: user.id,
      after: user
    });

    return reply.code(201).send(user);
  });

  app.patch("/:id", { preHandler: app.requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await app.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect
    });

    if (!before) {
      return reply.code(404).send({ message: "Пользователь не найден" });
    }

    const input = userUpdateSchema.parse(request.body);
    const user = await app.prisma.user.update({
      where: { id },
      data: {
        email: input.email?.toLowerCase(),
        passwordHash: input.password ? await argon2.hash(input.password) : undefined,
        name: input.name,
        role: input.role,
        isActive: input.isActive
      },
      select: publicUserSelect
    });

    await writeAuditLog(app.prisma, {
      userId: request.user.id,
      action: "user.update",
      entityType: "user",
      entityId: user.id,
      before,
      after: user
    });

    return user;
  });

  app.post("/:id/disable", { preHandler: app.requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await app.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect
    });

    if (!before) {
      return reply.code(404).send({ message: "Пользователь не найден" });
    }

    const user = await app.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: publicUserSelect
    });

    await writeAuditLog(app.prisma, {
      userId: request.user.id,
      action: "user.disable",
      entityType: "user",
      entityId: user.id,
      before,
      after: user
    });

    return user;
  });
}
