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
  updatedAt: true,
  directions: {
    include: { direction: true },
    orderBy: { direction: { sortOrder: "asc" } }
  }
} as const;

function serializeUser<T extends { directions: Array<{ direction: unknown }> }>(user: T) {
  return {
    ...user,
    directions: user.directions.map((item) => item.direction)
  };
}

export async function userRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireAdmin }, async () => {
    const users = await app.prisma.user.findMany({
      select: publicUserSelect,
      orderBy: [{ role: "asc" }, { name: "asc" }]
    });
    return users.map(serializeUser);
  });

  app.post("/", { preHandler: app.requireAdmin }, async (request, reply) => {
    const input = userCreateSchema.parse(request.body);
    const user = await app.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: await argon2.hash(input.password),
        name: input.name,
        role: input.role,
        directions: {
          create: input.directionSlugs.map((slug) => ({
            direction: { connect: { slug } }
          }))
        }
      },
      select: publicUserSelect
    });

    await writeAuditLog(app.prisma, {
      userId: request.user.id,
      action: "user.create",
      entityType: "user",
      entityId: user.id,
      after: serializeUser(user)
    });

    return reply.code(201).send(serializeUser(user));
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
        isActive: input.isActive,
        directions: input.directionSlugs
          ? {
              deleteMany: {},
              create: input.directionSlugs.map((slug) => ({
                direction: { connect: { slug } }
              }))
            }
          : undefined
      },
      select: publicUserSelect
    });

    await writeAuditLog(app.prisma, {
      userId: request.user.id,
      action: "user.update",
      entityType: "user",
      entityId: user.id,
      before,
      after: serializeUser(user)
    });

    return serializeUser(user);
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
      after: serializeUser(user)
    });

    return serializeUser(user);
  });
}
