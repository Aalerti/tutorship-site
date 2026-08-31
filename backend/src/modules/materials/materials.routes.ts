import { MaterialStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { writeAuditLog } from "../audit/audit.service.js";
import {
  archiveMaterial,
  createMaterial,
  getAdminMaterial,
  getPublicMaterial,
  listMaterials,
  setMaterialPinned,
  setMaterialStatus,
  softDeleteMaterial,
  unarchiveMaterial,
  updateMaterial
} from "./materials.service.js";
import { materialCreateSchema, materialListQuerySchema, materialUpdateSchema } from "./materials.schemas.js";

async function canManageDirection(app: FastifyInstance, userId: string, role: string, directionSlug: string) {
  if (role === "ADMIN") {
    return true;
  }

  const access = await app.prisma.userDirection.findFirst({
    where: {
      userId,
      direction: { slug: directionSlug }
    },
    select: { userId: true }
  });

  return Boolean(access);
}

async function canManageMaterial(app: FastifyInstance, userId: string, role: string, materialId: string) {
  if (role === "ADMIN") {
    return true;
  }

  const access = await app.prisma.userDirection.findFirst({
    where: {
      userId,
      direction: {
        materials: {
          some: { id: materialId }
        }
      }
    },
    select: { userId: true }
  });

  return Boolean(access);
}

export async function materialRoutes(app: FastifyInstance) {
  app.get("/materials", async (request) => {
    const input = materialListQuerySchema.parse(request.query);
    return listMaterials(app.prisma, {
      ...input,
      includeHidden: false,
      archived: input.archived
    });
  });

  app.get("/materials/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const material = await getPublicMaterial(app.prisma, slug);

    if (!material) {
      return reply.code(404).send({ message: "Материал не найден" });
    }

    return material;
  });

  app.get("/admin/materials", { preHandler: app.authenticate }, async (request) => {
    const input = materialListQuerySchema.parse(request.query);
    let direction = input.direction;

    if (request.user.role !== "ADMIN") {
      const allowedDirections = await app.prisma.userDirection.findMany({
        where: { userId: request.user.id },
        include: { direction: true },
        orderBy: { direction: { sortOrder: "asc" } }
      });
      const allowedSlugs = allowedDirections.map((item) => item.direction.slug);
      direction = input.direction ?? allowedSlugs[0];

      if (!direction || !allowedSlugs.includes(direction)) {
        return { items: [], total: 0, limit: input.limit, offset: input.offset };
      }
    }

    return listMaterials(app.prisma, {
      ...input,
      direction,
      includeHidden: true,
      archived: input.archived
    });
  });

  app.get("/admin/materials/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const material = await getAdminMaterial(app.prisma, id);

    if (!material) {
      return reply.code(404).send({ message: "Материал не найден" });
    }
    if (!(await canManageMaterial(app, request.user.id, request.user.role, id))) {
      return reply.code(403).send({ message: "Этот материал недоступен для вашего аккаунта" });
    }

    return material;
  });

  app.post("/admin/materials", { preHandler: app.authenticate }, async (request, reply) => {
    const input = materialCreateSchema.parse(request.body);
    const user = request.user;
    if (!(await canManageDirection(app, user.id, user.role, input.directionSlug))) {
      return reply.code(403).send({ message: "Это направление недоступно для вашего аккаунта" });
    }

    const material = await createMaterial(app.prisma, {
      ...input,
      authorId: user.id
    });

    await writeAuditLog(app.prisma, {
      userId: user.id,
      action: "material.create",
      entityType: "material",
      entityId: material.id,
      after: material
    });

    return reply.code(201).send(material);
  });

  app.patch("/admin/materials/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await getAdminMaterial(app.prisma, id);
    if (!before) {
      return reply.code(404).send({ message: "Материал не найден" });
    }

    const input = materialUpdateSchema.parse(request.body);
    if (!(await canManageMaterial(app, request.user.id, request.user.role, id))) {
      return reply.code(403).send({ message: "Этот материал недоступен для вашего аккаунта" });
    }
    if (input.directionSlug && !(await canManageDirection(app, request.user.id, request.user.role, input.directionSlug))) {
      return reply.code(403).send({ message: "Это направление недоступно для вашего аккаунта" });
    }

    const material = await updateMaterial(app.prisma, id, input);

    await writeAuditLog(app.prisma, {
      userId: request.user.id,
      action: "material.update",
      entityType: "material",
      entityId: material.id,
      before,
      after: material
    });

    return material;
  });

  app.post("/admin/materials/:id/publish", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await getAdminMaterial(app.prisma, id);
    if (!before) {
      return reply.code(404).send({ message: "Материал не найден" });
    }
    if (!(await canManageMaterial(app, request.user.id, request.user.role, id))) {
      return reply.code(403).send({ message: "Этот материал недоступен для вашего аккаунта" });
    }

    const material = await setMaterialStatus(app.prisma, id, MaterialStatus.PUBLISHED);
    await writeAuditLog(app.prisma, {
      userId: request.user.id,
      action: "material.publish",
      entityType: "material",
      entityId: id,
      before,
      after: material
    });

    return material;
  });

  app.post("/admin/materials/:id/unpublish", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await getAdminMaterial(app.prisma, id);
    if (!before) {
      return reply.code(404).send({ message: "Материал не найден" });
    }
    if (!(await canManageMaterial(app, request.user.id, request.user.role, id))) {
      return reply.code(403).send({ message: "Этот материал недоступен для вашего аккаунта" });
    }

    const material = await setMaterialStatus(app.prisma, id, MaterialStatus.HIDDEN);
    await writeAuditLog(app.prisma, {
      userId: request.user.id,
      action: "material.unpublish",
      entityType: "material",
      entityId: id,
      before,
      after: material
    });

    return material;
  });

  app.post("/admin/materials/:id/archive", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await getAdminMaterial(app.prisma, id);
    if (!before) {
      return reply.code(404).send({ message: "Материал не найден" });
    }
    if (!(await canManageMaterial(app, request.user.id, request.user.role, id))) {
      return reply.code(403).send({ message: "Этот материал недоступен для вашего аккаунта" });
    }

    const material = await archiveMaterial(app.prisma, id, request.user.id);
    await writeAuditLog(app.prisma, {
      userId: request.user.id,
      action: "material.archive",
      entityType: "material",
      entityId: id,
      before,
      after: material
    });

    return material;
  });

  app.post("/admin/materials/:id/unarchive", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await getAdminMaterial(app.prisma, id);
    if (!before) {
      return reply.code(404).send({ message: "Материал не найден" });
    }
    if (!(await canManageMaterial(app, request.user.id, request.user.role, id))) {
      return reply.code(403).send({ message: "Этот материал недоступен для вашего аккаунта" });
    }

    const material = await unarchiveMaterial(app.prisma, id);
    await writeAuditLog(app.prisma, {
      userId: request.user.id,
      action: "material.unarchive",
      entityType: "material",
      entityId: id,
      before,
      after: material
    });

    return material;
  });

  app.post("/admin/materials/:id/pin", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await getAdminMaterial(app.prisma, id);
    if (!before) {
      return reply.code(404).send({ message: "Материал не найден" });
    }
    if (!(await canManageMaterial(app, request.user.id, request.user.role, id))) {
      return reply.code(403).send({ message: "Этот материал недоступен для вашего аккаунта" });
    }

    const material = await setMaterialPinned(app.prisma, id, true);
    await writeAuditLog(app.prisma, {
      userId: request.user.id,
      action: "material.pin",
      entityType: "material",
      entityId: id,
      before,
      after: material
    });

    return material;
  });

  app.post("/admin/materials/:id/unpin", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await getAdminMaterial(app.prisma, id);
    if (!before) {
      return reply.code(404).send({ message: "Материал не найден" });
    }
    if (!(await canManageMaterial(app, request.user.id, request.user.role, id))) {
      return reply.code(403).send({ message: "Этот материал недоступен для вашего аккаунта" });
    }

    const material = await setMaterialPinned(app.prisma, id, false);
    await writeAuditLog(app.prisma, {
      userId: request.user.id,
      action: "material.unpin",
      entityType: "material",
      entityId: id,
      before,
      after: material
    });

    return material;
  });

  app.delete("/admin/materials/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await getAdminMaterial(app.prisma, id);
    if (!before) {
      return reply.code(404).send({ message: "Материал не найден" });
    }
    if (!(await canManageMaterial(app, request.user.id, request.user.role, id))) {
      return reply.code(403).send({ message: "Этот материал недоступен для вашего аккаунта" });
    }

    const material = await softDeleteMaterial(app.prisma, id, request.user.id);
    await writeAuditLog(app.prisma, {
      userId: request.user.id,
      action: "material.delete",
      entityType: "material",
      entityId: id,
      before,
      after: material
    });

    return { ok: true };
  });
}
