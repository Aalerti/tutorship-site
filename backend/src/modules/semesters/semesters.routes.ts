import type { FastifyInstance } from "fastify";

export async function semesterRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return app.prisma.semester.findMany({
      orderBy: [{ sortOrder: "asc" }, { number: "asc" }]
    });
  });
}
