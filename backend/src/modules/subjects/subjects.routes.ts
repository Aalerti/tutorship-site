import type { FastifyInstance } from "fastify";

export async function subjectRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const { direction } = request.query as { direction?: string };

    return app.prisma.subject.findMany({
      where: {
        isActive: true,
        direction: direction ? { slug: direction } : undefined
      },
      include: {
        direction: true
      },
      orderBy: [{ direction: { sortOrder: "asc" } }, { title: "asc" }]
    });
  });
}
