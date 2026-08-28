import { UserRole } from "@prisma/client";
import { z } from "zod";

export const userCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().min(2).max(120),
  role: z.nativeEnum(UserRole).default(UserRole.TUTOR)
});

export const userUpdateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional()
});
