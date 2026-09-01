import { MaterialStatus, Prisma, type PrismaClient } from "@prisma/client";
import { slugify } from "../../utils/slug.js";

type MaterialListInput = {
  direction?: string;
  semester?: number;
  subject?: string;
  type?: Prisma.EnumMaterialTypeFilter["equals"];
  search?: string;
  limit: number;
  offset: number;
  includeHidden: boolean;
  archived: boolean;
};

type MaterialCreateInput = {
  title: string;
  slug?: string;
  description?: string;
  content?: string;
  type?: "GUIDE" | "NOTES" | "EXAM" | "LINKS" | "OTHER";
  status?: "DRAFT" | "PUBLISHED" | "HIDDEN" | "DELETED";
  directionSlug: string;
  semesterNumber?: number;
  subjectSlug?: string;
  authorId?: string;
  coverImageUrl?: string;
  externalUrl?: string;
  fileUrl?: string;
  isPinned?: boolean;
  sortOrder?: number;
  attachments?: Array<{
    title: string;
    url: string;
    kind: "PDF" | "DOC" | "IMAGE" | "ARCHIVE" | "LINK" | "OTHER";
    sortOrder?: number;
  }>;
};

type MaterialUpdateInput = Omit<Partial<MaterialCreateInput>, "semesterNumber" | "subjectSlug"> & {
  semesterNumber?: number | null;
  subjectSlug?: string | null;
  replaceAttachments?: boolean;
};

async function makeUniqueSlug(prisma: PrismaClient, base: string, ignoredId?: string) {
  const normalized = slugify(base) || "material";

  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? normalized : `${normalized}-${index + 1}`;
    const existing = await prisma.material.findUnique({
      where: { slug: candidate },
      select: { id: true }
    });

    if (!existing || existing.id === ignoredId) {
      return candidate;
    }
  }

  return `${normalized}-${Date.now()}`;
}

const materialInclude = {
  direction: true,
  semester: true,
  subject: true,
  author: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  },
  attachments: {
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  }
} satisfies Prisma.MaterialInclude;

export async function listMaterials(prisma: PrismaClient, input: MaterialListInput) {
  const where: Prisma.MaterialWhereInput = {
    deletedAt: null,
    archivedAt: input.archived ? { not: null } : null
  };

  if (!input.includeHidden) {
    where.status = MaterialStatus.PUBLISHED;
  } else {
    where.status = { not: MaterialStatus.DELETED };
  }

  if (input.direction) {
    where.direction = { slug: input.direction };
  }

  if (input.semester) {
    where.semester = { number: input.semester };
  }

  if (input.subject) {
    where.subject = { slug: input.subject };
  }

  if (input.type) {
    where.type = input.type;
  }

  if (input.search) {
    where.OR = [
      { title: { contains: input.search, mode: "insensitive" } },
      { description: { contains: input.search, mode: "insensitive" } },
      { content: { contains: input.search, mode: "insensitive" } },
      { subject: { title: { contains: input.search, mode: "insensitive" } } },
      { subject: { shortTitle: { contains: input.search, mode: "insensitive" } } }
    ];
  }

  const [items, total] = await prisma.$transaction([
    prisma.material.findMany({
      where,
      include: materialInclude,
      orderBy: [
        { isPinned: "desc" },
        { sortOrder: "asc" },
        { publishedAt: "desc" },
        { createdAt: "desc" }
      ],
      take: input.limit,
      skip: input.offset
    }),
    prisma.material.count({ where })
  ]);

  return {
    items,
    total,
    limit: input.limit,
    offset: input.offset
  };
}

export async function getPublicMaterial(prisma: PrismaClient, slug: string) {
  return prisma.material.findFirst({
    where: {
      slug,
      deletedAt: null,
      status: MaterialStatus.PUBLISHED
    },
    include: materialInclude
  });
}

export async function getAdminMaterial(prisma: PrismaClient, id: string) {
  return prisma.material.findFirst({
    where: {
      id,
      deletedAt: null
    },
    include: materialInclude
  });
}

export async function createMaterial(prisma: PrismaClient, input: MaterialCreateInput) {
  const direction = await prisma.direction.findUniqueOrThrow({
    where: { slug: input.directionSlug }
  });
  const semester = input.semesterNumber
    ? await prisma.semester.findUniqueOrThrow({ where: { number: input.semesterNumber } })
    : null;
  const subject = input.subjectSlug
    ? await prisma.subject.findUniqueOrThrow({
        where: {
          directionId_slug: {
            directionId: direction.id,
            slug: input.subjectSlug
          }
        }
      })
    : null;
  const slug = input.slug
    ? await makeUniqueSlug(prisma, input.slug)
    : await makeUniqueSlug(prisma, input.title);
  const status = input.status ?? MaterialStatus.PUBLISHED;

  return prisma.material.create({
    data: {
      title: input.title,
      slug,
      description: input.description,
      content: input.content,
      type: input.type,
      status,
      directionId: direction.id,
      semesterId: semester?.id,
      subjectId: subject?.id,
      authorId: input.authorId,
      coverImageUrl: input.coverImageUrl,
      externalUrl: input.externalUrl,
      fileUrl: input.fileUrl,
      isPinned: input.isPinned,
      sortOrder: input.sortOrder,
      publishedAt: status === MaterialStatus.PUBLISHED ? new Date() : null,
      attachments: {
        create: input.attachments ?? []
      }
    },
    include: materialInclude
  });
}

export async function updateMaterial(prisma: PrismaClient, id: string, input: MaterialUpdateInput) {
  const existing = await prisma.material.findUniqueOrThrow({ where: { id } });
  const direction = input.directionSlug
    ? await prisma.direction.findUniqueOrThrow({ where: { slug: input.directionSlug } })
    : null;
  const semester = input.semesterNumber
    ? await prisma.semester.findUniqueOrThrow({ where: { number: input.semesterNumber } })
    : null;
  const subject = input.subjectSlug && (direction || existing.directionId)
    ? await prisma.subject.findUniqueOrThrow({
        where: {
          directionId_slug: {
            directionId: direction?.id ?? existing.directionId,
            slug: input.subjectSlug
          }
        }
      })
    : null;

  return prisma.material.update({
    where: { id },
    data: {
      title: input.title,
      slug: input.slug ? await makeUniqueSlug(prisma, input.slug, id) : input.title ? await makeUniqueSlug(prisma, input.title, id) : undefined,
      description: input.description,
      content: input.content,
      type: input.type,
      status: input.status,
      directionId: direction?.id,
      semesterId: input.semesterNumber === undefined ? undefined : semester?.id ?? null,
      subjectId: input.subjectSlug !== undefined ? subject?.id ?? null : input.directionSlug ? null : undefined,
      coverImageUrl: input.coverImageUrl,
      externalUrl: input.externalUrl,
      fileUrl: input.fileUrl,
      isPinned: input.isPinned,
      sortOrder: input.sortOrder,
      publishedAt: input.status === MaterialStatus.PUBLISHED && !existing.publishedAt ? new Date() : undefined,
      attachments: input.replaceAttachments
        ? {
            deleteMany: {},
            create: input.attachments ?? []
          }
        : undefined
    },
    include: materialInclude
  });
}

export async function setMaterialStatus(prisma: PrismaClient, id: string, status: MaterialStatus) {
  return prisma.material.update({
    where: { id },
    data: {
      status,
      publishedAt: status === MaterialStatus.PUBLISHED ? new Date() : undefined
    },
    include: materialInclude
  });
}

export async function setMaterialPinned(prisma: PrismaClient, id: string, isPinned: boolean) {
  return prisma.material.update({
    where: { id },
    data: { isPinned },
    include: materialInclude
  });
}

export async function softDeleteMaterial(prisma: PrismaClient, id: string, userId: string) {
  return prisma.material.update({
    where: { id },
    data: {
      status: MaterialStatus.DELETED,
      deletedAt: new Date(),
      deletedBy: userId
    },
    include: materialInclude
  });
}

export async function archiveMaterial(prisma: PrismaClient, id: string, userId: string) {
  return prisma.material.update({
    where: { id },
    data: {
      archivedAt: new Date(),
      archivedBy: userId
    },
    include: materialInclude
  });
}

export async function unarchiveMaterial(prisma: PrismaClient, id: string) {
  return prisma.material.update({
    where: { id },
    data: {
      archivedAt: null,
      archivedBy: null
    },
    include: materialInclude
  });
}
