import { PrismaClient, MaterialStatus, MaterialType, UserRole } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

const directions = [
  ["pi", "ПИ", "Программная инженерия", 1],
  ["fiit", "ФИИТ", "Фундаментальная информатика и информационные технологии", 2],
  ["moais", "МОАИС", "Математическое обеспечение и администрирование информационных систем", 3],
  ["kb", "КБ", "Компьютерная безопасность", 4],
  ["sau", "САУ", "Системный анализ и управление", 5],
  ["ivt", "ИВТ", "Информатика и вычислительная техника", 6]
] as const;

const semesters = [
  [1, "Первый семестр", "Старт учёбы и первые предметы"],
  [2, "Первая сессия", "Материалы для первой сессии"],
  [3, "Второй семестр", "Продолжение первого курса"]
] as const;

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@tutorship.local" },
    update: {},
    create: {
      email: "admin@tutorship.local",
      name: "Администратор",
      role: UserRole.ADMIN,
      passwordHash: await argon2.hash("change-me-admin")
    }
  });

  for (const [slug, shortName, fullName, sortOrder] of directions) {
    await prisma.direction.upsert({
      where: { slug },
      update: { shortName, fullName, sortOrder, isActive: true },
      create: { slug, shortName, fullName, sortOrder, isActive: true }
    });
  }

  for (const [number, title, description] of semesters) {
    await prisma.semester.upsert({
      where: { number },
      update: { title, description, sortOrder: number },
      create: { number, title, description, sortOrder: number }
    });
  }

  const pi = await prisma.direction.findUniqueOrThrow({ where: { slug: "pi" } });

  const materialSeeds = [
    {
      title: "Начало начал",
      slug: "nachalo-nachal",
      description: "Гайд на первый семестр",
      externalUrl: "/posts/2025/1/",
      semesterNumber: 1,
      publishedAt: new Date("2025-08-27T00:00:00.000Z"),
      sortOrder: 1
    },
    {
      title: "Вода, огонь и медные трубы",
      slug: "voda-ogon-i-mednye-truby",
      description: "Гайд на первую сессию",
      externalUrl: "/posts/2025/2/",
      semesterNumber: 2,
      publishedAt: new Date("2025-11-25T00:00:00.000Z"),
      sortOrder: 2
    },
    {
      title: "О дивный новый мир!",
      slug: "o-divnyy-novyy-mir",
      description: "Гайд на второй семестр",
      externalUrl: "/posts/2025/3/",
      semesterNumber: 3,
      publishedAt: new Date("2026-02-06T00:00:00.000Z"),
      sortOrder: 3
    }
  ];

  for (const seed of materialSeeds) {
    const semester = await prisma.semester.findUniqueOrThrow({
      where: { number: seed.semesterNumber }
    });

    await prisma.material.upsert({
      where: { slug: seed.slug },
      update: {
        title: seed.title,
        description: seed.description,
        externalUrl: seed.externalUrl,
        semesterId: semester.id,
        directionId: pi.id,
        status: MaterialStatus.PUBLISHED,
        publishedAt: seed.publishedAt,
        sortOrder: seed.sortOrder
      },
      create: {
        title: seed.title,
        slug: seed.slug,
        description: seed.description,
        type: MaterialType.GUIDE,
        status: MaterialStatus.PUBLISHED,
        externalUrl: seed.externalUrl,
        semesterId: semester.id,
        directionId: pi.id,
        authorId: admin.id,
        publishedAt: seed.publishedAt,
        sortOrder: seed.sortOrder
      }
    });
  }

  console.log("Seed completed");
  console.log("Admin login: admin@tutorship.local");
  console.log("Admin password: change-me-admin");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
