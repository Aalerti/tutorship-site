import { MaterialStatus, Prisma, type PrismaClient } from "@prisma/client";
import { slugify } from "../../utils/slug.js";

type MaterialListInput = {
  direction?: string;
  semester?: number;
  type?: Prisma.EnumMaterialTypeFilter["equals"];
  search?: string;
  limit: number;
  offset: number;
  includeHidden: boolean;
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

type MaterialUpdateInput = Partial<MaterialCreateInput> & {
  replaceAttachments?: boolean;
};

const materialInclude = {
  direction: true,
  semester: true,
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
    deletedAt: null
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

  if (input.type) {
    where.type = input.type;
  }

  if (input.search) {
    where.OR = [
      { title: { contains: input.search, mode: "insensitive" } },
      { description: { contains: input.search, mode: "insensitive" } },
      { content: { contains: input.search, mode: "insensitive" } }
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
  const slug = input.slug ?? slugify(input.title);
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

  return prisma.material.update({
    where: { id },
    data: {
      title: input.title,
      slug: input.slug,
      description: input.description,
      content: input.content,
      type: input.type,
      status: input.status,
      directionId: direction?.id,
      semesterId: input.semesterNumber === undefined ? undefined : semester?.id ?? null,
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
