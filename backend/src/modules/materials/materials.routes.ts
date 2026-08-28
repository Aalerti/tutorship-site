import { MaterialStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { writeAuditLog } from "../audit/audit.service.js";
import {
  createMaterial,
  getAdminMaterial,
  getPublicMaterial,
  listMaterials,
  setMaterialStatus,
  softDeleteMaterial,
  updateMaterial
} from "./materials.service.js";
import { materialCreateSchema, materialListQuerySchema, materialUpdateSchema } from "./materials.schemas.js";

export async function materialRoutes(app: FastifyInstance) {
  app.get("/materials", async (request) => {
    const input = materialListQuerySchema.parse(request.query);
    return listMaterials(app.prisma, {
      ...input,
      includeHidden: false
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
    return listMaterials(app.prisma, {
      ...input,
      includeHidden: true
    });
  });

  app.get("/admin/materials/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const material = await getAdminMaterial(app.prisma, id);

    if (!material) {
      return reply.code(404).send({ message: "Материал не найден" });
    }

    return material;
  });

  app.post("/admin/materials", { preHandler: app.authenticate }, async (request, reply) => {
    const input = materialCreateSchema.parse(request.body);
    const user = request.user;
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

  app.delete("/admin/materials/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await getAdminMaterial(app.prisma, id);
    if (!before) {
      return reply.code(404).send({ message: "Материал не найден" });
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
