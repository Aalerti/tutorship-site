import type { FastifyInstance } from "fastify";

export async function directionRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return app.prisma.direction.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { shortName: "asc" }]
    });
  });
}
