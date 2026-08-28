import { MaterialStatus, MaterialType } from "@prisma/client";
import { z } from "zod";

export const materialListQuerySchema = z.object({
  direction: z.string().optional(),
  semester: z.coerce.number().int().positive().optional(),
  type: z.nativeEnum(MaterialType).optional(),
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
  includeHidden: z.coerce.boolean().default(false)
});

export const materialCreateSchema = z.object({
  title: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  description: z.string().trim().max(500).optional(),
  content: z.string().optional(),
  type: z.nativeEnum(MaterialType).default(MaterialType.GUIDE),
  status: z.nativeEnum(MaterialStatus).default(MaterialStatus.PUBLISHED),
  directionSlug: z.string().trim().min(1),
  semesterNumber: z.number().int().positive().optional(),
  coverImageUrl: z.string().url().optional(),
  externalUrl: z.string().url().optional(),
  fileUrl: z.string().optional(),
  isPinned: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  attachments: z.array(z.object({
    title: z.string().trim().min(1).max(160),
    url: z.string().min(1),
    kind: z.enum(["PDF", "DOC", "IMAGE", "ARCHIVE", "LINK", "OTHER"]).default("LINK"),
    sortOrder: z.number().int().default(0)
  })).default([])
});

export const materialUpdateSchema = materialCreateSchema.partial().extend({
  directionSlug: z.string().trim().min(1).optional(),
  replaceAttachments: z.boolean().default(false)
});
