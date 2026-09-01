import { PrismaClient, MaterialStatus, MaterialType, UserRole } from "@prisma/client";
import argon2 from "argon2";
import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();
const adminEmail = process.env.ADMIN_EMAIL || "admin@tutorship.local";
const adminPassword = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "change-me-admin");

if (!adminPassword) {
  throw new Error("ADMIN_PASSWORD is required when NODE_ENV=production");
}

if (adminPassword.length < 8) {
  throw new Error("ADMIN_PASSWORD must be at least 8 characters long");
}

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
  [2, "Второй семестр", "Продолжение первого курса"],
  [3, "Третий семестр", "Второй курс, осенний семестр"],
  [4, "Четвёртый семестр", "Второй курс, весенний семестр"],
  [5, "Пятый семестр", "Третий курс, осенний семестр"],
  [6, "Шестой семестр", "Третий курс, весенний семестр"],
  [7, "Седьмой семестр", "Четвёртый курс, осенний семестр"],
  [8, "Восьмой семестр", "Четвёртый курс, весенний семестр"]
] as const;

type MaterialSeed = {
  title: string;
  slug: string;
  description: string;
  semesterNumber: number;
  subjectSlug?: string;
  type: MaterialType;
  externalUrl?: string;
  fileUrl?: string;
  publishedAt: Date;
  sortOrder: number;
  archived?: boolean;
};

const catalogFileExtensions = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".odt",
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".zip",
  ".ppt",
  ".pptx",
  ".apkg"
]);

async function listCatalogFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return listCatalogFiles(entryPath);
      }

      if (!catalogFileExtensions.has(path.extname(entry.name).toLowerCase())) {
        return [];
      }

      return [entryPath];
    })
  );

  return files.flat();
}

function publicFileUrl(staticRoot: string, filePath: string) {
  const relativePath = path.relative(staticRoot, filePath).split(path.sep);
  return "/" + relativePath.map((part) => encodeURIComponent(part)).join("/");
}

function normalizeFileUrl(fileUrl: string) {
  return fileUrl.split("/").map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  }).join("/");
}

function titleFromFile(filePath: string) {
  const parsed = path.parse(filePath);
  return parsed.name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function subjectSlugFromPath(filePath: string) {
  const lower = filePath.toLowerCase();

  if (lower.includes("матан")) return "mat-analysis";
  if (lower.includes("алгем")) return "linear-algebra";
  if (lower.includes("инфопрога") || lower.includes("прога")) return "programming";
  if (lower.includes("теринфа")) return "theory-of-information";
  if (lower.includes("история")) return "history";

  return undefined;
}

function semesterNumberFromPath(filePath: string) {
  const normalized = filePath.replaceAll(path.sep, "/").toLowerCase();
  const semesterMatch = normalized.match(/(\d+)\s*семестр/);
  if (semesterMatch) return Number(semesterMatch[1]);

  const sessionMatch = normalized.match(/(\d+)\s*сессия/);
  if (sessionMatch) return Number(sessionMatch[1]);

  const yearPostMatch = normalized.match(/\/20\d{2}\/(\d+)\//);
  if (yearPostMatch) return Number(yearPostMatch[1]);

  return 1;
}

function materialTypeFromPath(filePath: string) {
  const lower = filePath.toLowerCase();
  const ext = path.extname(lower);

  if (
    lower.includes("экзам") ||
    lower.includes("exam") ||
    lower.includes("коллок") ||
    lower.includes("зач") ||
    lower.includes("сессия") ||
    lower.includes("вопрос") ||
    lower.includes("ответ")
  ) {
    return MaterialType.EXAM;
  }

  if (ext === ".apkg" || ext === ".zip" || [".png", ".jpg", ".jpeg", ".webp", ".ppt", ".pptx"].includes(ext)) {
    return MaterialType.OTHER;
  }

  return MaterialType.NOTES;
}

function autoSlugForFile(fileUrl: string) {
  return `file-${createHash("sha1").update(fileUrl).digest("hex").slice(0, 16)}`;
}

const subjectSlugOverrides: Record<string, string> = {
  "Алгебра и геометрия": "linear-algebra",
  "Базы данных": "databases",
  "Информационные технологии и программирование": "programming",
  "История России": "history",
  "Математический анализ": "mat-analysis",
  "Теоретическая информатика": "theory-of-information"
};

function subjectSlugForTitle(title: string) {
  return subjectSlugOverrides[title] ?? `subject-${createHash("sha1").update(title).digest("hex").slice(0, 12)}`;
}

function uniqueSortedTitles(titles: readonly string[]) {
  return Array.from(new Set(titles)).sort((a, b) => a.localeCompare(b, "ru"));
}

const piSubjects = [
  "Алгебра и геометрия",
  "Базы данных",
  "Бекэнд-разработка (Яндекс)",
  "Безопасность жизнедеятельности",
  "Введение в специальность",
  "Введение в учебный процесс",
  "Дифференциальные уравнения",
  "Дискретная математика",
  "Игровые/циклические виды спорта",
  "Иностранный язык",
  "Интеллектуальные системы и технологии",
  "Информационная безопасность и защита информации",
  "Информационные технологии и программирование",
  "История России",
  "Компьютерные сети",
  "Математическая логика и теория алгоритмов",
  "Математический анализ",
  "Машинно-зависимые языки программирования",
  "Методы вычислений",
  "Научно-исследовательская работа",
  "Операционные системы",
  "Основы права и антикоррупционного поведения",
  "Основы российской государственности",
  "Основы системного анализа",
  "Основы экономики и финансовой грамотности",
  "Ознакомительная практика (Яндекс)",
  "Параллельное и распределенное программирование",
  "Преддипломная практика",
  "Программирование и конфигурирование в корпоративных информационных системах",
  "Программные средства решения математических задач",
  "Проектирование архитектуры информационных систем",
  "Русский язык и культура речи",
  "Современные информационные технологии",
  "Специалист по эксплуатации БПЛА",
  "Структуры данных и алгоритмы",
  "Теоретическая информатика",
  "Теория вероятностей и математическая статистика",
  "Теория графов",
  "Тестирование программного обеспечения",
  "Технологии программирования",
  "Технологическая практика",
  "Управление проектами",
  "Физика",
  "Физическая культура и спорт",
  "Философия",
  "Формальные языки и грамматики",
  "Фронтенд-разработка (Яндекс)",
  "Языки программирования"
] as const;

const fiitSubjects = piSubjects;

const moaisSubjects = [
  "Администрирование операционных систем и сетей",
  "Алгебра и геометрия",
  "Анализ стохастических систем",
  "Архитектура систем хранения и обработки данных",
  "Базы данных",
  "Бекэнд-разработка (Яндекс)",
  "Безопасность жизнедеятельности",
  "Введение в специальность",
  "Введение в учебный процесс",
  "Деловая коммуникация",
  "Дискретная математика",
  "Игровые/циклические виды спорта",
  "Иностранный язык",
  "Инструменты анализа данных",
  "Интеллектуальные системы поддержки принятия решений",
  "Информационная безопасность и защита информации",
  "Информационные технологии и программирование",
  "История России",
  "История развития и современные тренды искусственного интеллекта",
  "Математическая логика",
  "Математические методы теории управления",
  "Математический анализ",
  "Машинное обучение",
  "Методы анализа статистических данных",
  "Методы оптимизации в анализе данных",
  "Методология разработки решений на основе искусственного интеллекта",
  "Нейронные сети и глубокое обучение",
  "Общая физическая подготовка",
  "Ознакомительная практика (Яндекс)",
  "Основы права и антикоррупционного поведения",
  "Основы российской государственности",
  "Параллельная обработка и анализ данных",
  "Преддипломная практика",
  "Программирование и конфигурирование корпоративных информационных систем",
  "Программирование на C++",
  "Программирование на языке Java",
  "Проектная практика (Яндекс)",
  "Процессы и инструменты управления данными",
  "Разработка Web-приложений",
  "Разработка пользовательского интерфейса",
  "Распределенные и облачные системы",
  "Русский язык и культура речи",
  "Структуры и алгоритмы обработки данных",
  "Теория вероятностей и математическая статистика",
  "Теория игр",
  "Тестирование программного обеспечения",
  "Технологии высокопроизводительной обработки больших данных",
  "Технологическая практика",
  "Управление программными проектами в сфере искусственного интеллекта",
  "Физическая культура и спорт",
  "Философия",
  "Фронтенд-разработка (Яндекс)"
] as const;

const ivtSubjects = [
  "Алгебра и геометрия",
  "Базы данных",
  "Бекэнд-разработка (Яндекс)",
  "Безопасность жизнедеятельности",
  "Введение в криптографию",
  "Введение в специальность",
  "Введение в учебный процесс",
  "Игровые/циклические виды спорта",
  "Иностранный язык",
  "Инженерная графика",
  "Информационная безопасность и защита информации",
  "Информационные технологии и программирование",
  "История России",
  "Конструкторско-технологическое обеспечение производства ЭВМ",
  "Математическая логика и теория алгоритмов",
  "Математический анализ",
  "Методы вычислений",
  "Методы оптимизации",
  "Методы трансляции",
  "Микропроцессорные системы",
  "Научно-исследовательская работа",
  "Операционные системы",
  "Организация ЭВМ и систем",
  "Основы права и антикоррупционного поведения",
  "Основы российской государственности",
  "Основы экономики и финансовой грамотности",
  "Преддипломная практика",
  "Программирование и конфигурирование в корпоративных информационных системах",
  "Проектная практика (Яндекс)",
  "Распределенные базы данных",
  "Русский язык и культура речи",
  "Сети и телекоммуникации",
  "Системное программное обеспечение",
  "Системы мультимедиа",
  "Системы реального времени",
  "Системы и сети передачи информации",
  "Современные информационные технологии",
  "Специалист по эксплуатации БПЛА",
  "Стандартизация программного обеспечения",
  "Структуры данных и алгоритмы",
  "Теория автоматов",
  "Теория вероятностей и математическая статистика",
  "Технологическая практика",
  "Физика",
  "Физическая культура и спорт",
  "Философия",
  "Формальные языки и грамматики",
  "Фронтенд-разработка (Яндекс)",
  "Электроника и схемотехника"
] as const;

const sauSubjects = [
  "Алгебра и геометрия",
  "Анализ стохастических систем",
  "Архитектура вычислительных систем и компьютерных сетей",
  "Базы данных",
  "Бекэнд-разработка (Яндекс)",
  "Безопасность жизнедеятельности",
  "Введение в специальность",
  "Введение в системный анализ",
  "Введение в учебный процесс",
  "Дифференциальные уравнения",
  "Игровые/циклические виды спорта",
  "Иностранный язык",
  "Интеллектуальные технологии и представление знаний",
  "Информационные технологии и программирование",
  "Исследование операций",
  "История России",
  "Математическая логика и теория алгоритмов",
  "Математические методы теории управления",
  "Математический анализ",
  "Математическое моделирование систем",
  "Методы анализа статистических данных",
  "Методы вычислений",
  "Методы и средства измерения систем",
  "Методы оптимизации",
  "Модели и методы теории массового обслуживания",
  "Моделирование телекоммуникационных систем и компьютерных сетей",
  "Научно-исследовательская работа",
  "Общая физическая подготовка",
  "Основы дефектологии и инклюзивная практика",
  "Основы права и антикоррупционного поведения",
  "Основы российской государственности",
  "Основы теории надежности систем",
  "Основы экономики и финансовой грамотности",
  "Преддипломная практика",
  "Проектная практика (Яндекс)",
  "Проектно-конструкторская практика",
  "Русский язык и культура речи",
  "Системный анализ и принятие решений",
  "Системы и сети передачи данных",
  "Специалист по эксплуатации БПЛА",
  "Структуры данных и алгоритмы",
  "Теория вероятностей и математическая статистика",
  "Теория информационных систем",
  "Теория систем и управление сложными системами",
  "Физика",
  "Физическая культура и спорт",
  "Философия",
  "Фронтенд-разработка (Яндекс)"
] as const;

const kbSubjects = [
  "Алгебра",
  "Аппаратные средства вычислительной техники",
  "Алгоритмы алгебры и теории чисел",
  "Безопасность жизнедеятельности",
  "Введение в криптоанализ",
  "Введение в специальность",
  "Введение в учебный процесс",
  "Геометрия",
  "Дискретная математика",
  "Защита в операционных системах",
  "Защита информации от утечки по техническим каналам",
  "Игровые/циклические виды спорта",
  "Иностранный язык",
  "Интеллектуальные системы и технологии",
  "Информационные технологии и программирование",
  "История России",
  "Компьютерные сети",
  "Криптографические протоколы",
  "Математический анализ",
  "Методы алгебраической геометрии в криптографии",
  "Методы и средства криптографической защиты информации",
  "Методы программирования",
  "Модели безопасности компьютерных систем",
  "Нейронные сети",
  "Операционные системы",
  "Организационное и правовое обеспечение информационной безопасности",
  "Основы информационной безопасности",
  "Основы компьютерной экспертизы",
  "Основы построения защищенных баз данных",
  "Основы построения защищенных компьютерных сетей",
  "Основы права и антикоррупционного поведения",
  "Основы российской государственности",
  "Основы управленческой деятельности",
  "Преддипломная практика",
  "Прикладная универсальная алгебра",
  "Программно-аппаратные средства обеспечения информационной безопасности",
  "Программные средства решения математических задач",
  "Сети и системы передачи информации",
  "Системы управления базами данных",
  "Сложность вычислений",
  "Специалист по эксплуатации беспилотных авиационных систем",
  "Теоретико-числовые методы в криптографии",
  "Теория автоматов",
  "Теория вероятностей и математическая статистика",
  "Теория графов",
  "Теория информации",
  "Теория кодирования, сжатия и восстановления информации",
  "Теория псевдослучайных генераторов",
  "Физика",
  "Физическая культура и спорт",
  "Философия",
  "Электроника и схемотехника",
  "Эксплуатационная практика"
] as const;

const directionSubjects: Record<string, readonly string[]> = {
  pi: piSubjects,
  fiit: fiitSubjects,
  moais: moaisSubjects,
  kb: kbSubjects,
  sau: sauSubjects,
  ivt: ivtSubjects
};

async function main() {
  const archivedAt = new Date("2026-08-28T00:00:00.000Z");
  const adminPasswordHash = await argon2.hash(adminPassword);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: "Администратор",
      role: UserRole.ADMIN,
      passwordHash: adminPasswordHash,
      isActive: true
    },
    create: {
      email: adminEmail,
      name: "Администратор",
      role: UserRole.ADMIN,
      passwordHash: adminPasswordHash
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

  for (const [directionSlug, shortName] of directions.map(([slug, shortName]) => [slug, shortName] as const)) {
    const direction = await prisma.direction.findUniqueOrThrow({ where: { slug: directionSlug } });
    const subjects = uniqueSortedTitles(directionSubjects[directionSlug] ?? []);

    for (const [index, title] of subjects.entries()) {
      const slug = subjectSlugForTitle(title);
      const shortTitle = title.length > 32 ? title.replace(/\s*\([^)]*\)/g, "") : title;
      await prisma.subject.upsert({
        where: {
          directionId_slug: {
            directionId: direction.id,
            slug
          }
        },
        update: {
          title,
          shortTitle,
          description: `Учебная дисциплина направления ${shortName}`,
          sortOrder: index + 1,
          isActive: true
        },
        create: {
          slug,
          title,
          shortTitle,
          description: `Учебная дисциплина направления ${shortName}`,
          sortOrder: index + 1,
          directionId: direction.id,
          isActive: true
        }
      });
    }
  }

  const pi = await prisma.direction.findUniqueOrThrow({ where: { slug: "pi" } });

  const materialSeeds: MaterialSeed[] = [
    {
      title: "Начало начал",
      slug: "nachalo-nachal",
      description: "Гайд на первый семестр",
      externalUrl: "/posts/2025/1/",
      semesterNumber: 1,
      subjectSlug: undefined,
      type: MaterialType.GUIDE,
      publishedAt: new Date("2025-08-27T00:00:00.000Z"),
      sortOrder: 1,
      archived: true
    },
    {
      title: "Вода, огонь и медные трубы",
      slug: "voda-ogon-i-mednye-truby",
      description: "Гайд на первую сессию",
      externalUrl: "/posts/2025/2/",
      semesterNumber: 2,
      subjectSlug: undefined,
      type: MaterialType.GUIDE,
      publishedAt: new Date("2025-11-25T00:00:00.000Z"),
      sortOrder: 2,
      archived: true
    },
    {
      title: "О дивный новый мир!",
      slug: "o-divnyy-novyy-mir",
      description: "Гайд на второй семестр",
      externalUrl: "/posts/2025/3/",
      semesterNumber: 2,
      subjectSlug: undefined,
      type: MaterialType.GUIDE,
      publishedAt: new Date("2026-02-06T00:00:00.000Z"),
      sortOrder: 3,
      archived: true
    },
    {
      title: "Навигатор первого семестра",
      slug: "first-semester-navigator",
      description: "Живой гайд по первому семестру: где искать материалы и как не теряться в предметах.",
      externalUrl: "/posts/2025/1/",
      semesterNumber: 1,
      type: MaterialType.GUIDE,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      sortOrder: 4
    },
    {
      title: "Мат. анализ: программа экзамена",
      slug: "mat-analysis-exam-program",
      description: "Отдельная полка для экзаменационной программы по математическому анализу.",
      fileUrl: "/2025/1%20семестр/Матан/ПрограммаКоллоквиума1.pdf",
      semesterNumber: 1,
      subjectSlug: "mat-analysis",
      type: MaterialType.EXAM,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      sortOrder: 10
    },
    {
      title: "Мат. анализ: экзаменационные ответы",
      slug: "mat-analysis-exam-answers",
      description: "Ответы и материалы для подготовки к экзамену по математическому анализу.",
      fileUrl: "/2025/1%20семестр/Матан/экзамен_ответы.pdf",
      semesterNumber: 1,
      subjectSlug: "mat-analysis",
      type: MaterialType.EXAM,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      sortOrder: 11
    },
    {
      title: "Мат. анализ: контрольная работа 1",
      slug: "mat-analysis-kr1",
      description: "Обычные материалы по семестру отдельно от экзаменационной подготовки.",
      fileUrl: "/2025/1%20семестр/Матан/кр1.pdf",
      semesterNumber: 1,
      subjectSlug: "mat-analysis",
      type: MaterialType.NOTES,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      sortOrder: 12
    },
    {
      title: "Мат. анализ: образцы задач к экзамену",
      slug: "mat-analysis-exam-samples",
      description: "Задачи для тренировки перед экзаменом, отдельно от обычных семестровых конспектов.",
      fileUrl: "/2024/2/матан/Obraztsy_zadach_na_ekz_1_sem.pdf",
      semesterNumber: 2,
      subjectSlug: "mat-analysis",
      type: MaterialType.EXAM,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      sortOrder: 13
    },
    {
      title: "Алгем: задачник Беклемишева",
      slug: "linear-algebra-beklemishev",
      description: "Базовый задачник по алгебре и геометрии для регулярной работы в семестре.",
      fileUrl: "/2025/1%20семестр/Алгем/БеклЗадачи.pdf",
      semesterNumber: 1,
      subjectSlug: "linear-algebra",
      type: MaterialType.NOTES,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      sortOrder: 20
    },
    {
      title: "Алгем: вопросы к экзамену",
      slug: "linear-algebra-exam-questions",
      description: "Экзаменационные вопросы по алгебре и геометрии отдельным блоком.",
      fileUrl: "/2025/1%20семестр/Алгем/АЛГЕМ_Вопросы_экзамен.pdf",
      semesterNumber: 1,
      subjectSlug: "linear-algebra",
      type: MaterialType.EXAM,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      sortOrder: 21
    },
    {
      title: "Программирование: контрольная работа",
      slug: "programming-control-work",
      description: "Материал для практики по программированию в течение семестра.",
      fileUrl: "/2025/1%20семестр/Инфопрога/KR.pdf",
      semesterNumber: 1,
      subjectSlug: "programming",
      type: MaterialType.NOTES,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      sortOrder: 30
    },
    {
      title: "Программирование: итоговый тест",
      slug: "programming-final-test-review",
      description: "Разбор итогового теста и экзаменационные материалы по инфопроге.",
      fileUrl: "/2024/2/прога/Itogovy_test_Attempt_review.pdf",
      semesterNumber: 2,
      subjectSlug: "programming",
      type: MaterialType.EXAM,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      sortOrder: 31
    },
    {
      title: "Программирование: Anki-колода",
      slug: "programming-anki-deck",
      description: "Файл APKG для повторения терминов и задач.",
      fileUrl: "/2024/2/прога/Инфопрога-Итог.apkg",
      semesterNumber: 2,
      subjectSlug: "programming",
      type: MaterialType.OTHER,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      sortOrder: 32
    },
    {
      title: "ТеорИнфа: методичка",
      slug: "theory-of-information-methods",
      description: "Методичка по теории информации для занятий в первом семестре.",
      fileUrl: "/2025/1%20семестр/ТеорИнфа/TI_Metodichka.pdf",
      semesterNumber: 1,
      subjectSlug: "theory-of-information",
      type: MaterialType.NOTES,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      sortOrder: 40
    },
    {
      title: "ТеорИнфа: задания к зачёту",
      slug: "theory-of-information-test-tasks",
      description: "Задания и материалы для подготовки к зачёту/экзамену.",
      fileUrl: "/2025/1%20сессия/ТеорИнфа/задания.pdf",
      semesterNumber: 1,
      subjectSlug: "theory-of-information",
      type: MaterialType.EXAM,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      sortOrder: 41
    },
    {
      title: "История: методичка",
      slug: "history-methods",
      description: "Методические материалы по истории России.",
      fileUrl: "/2025/1%20семестр/История/ИсторияРоссииМетодичка.pdf",
      semesterNumber: 1,
      subjectSlug: "history",
      type: MaterialType.NOTES,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      sortOrder: 50
    },
    {
      title: "История: учебник",
      slug: "history-textbook",
      description: "Учебник по истории России для регулярной подготовки.",
      fileUrl: "/2025/1%20семестр/История/ИсторияРоссииУчебник.pdf",
      semesterNumber: 1,
      subjectSlug: "history",
      type: MaterialType.NOTES,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      sortOrder: 51
    },
    {
      title: "Полезные ссылки первокурсника",
      slug: "freshman-useful-links",
      description: "Быстрые ссылки на сайт СГУ, материалы курса и навигацию по платформе.",
      externalUrl: "https://www.sgu.ru/",
      semesterNumber: 1,
      type: MaterialType.LINKS,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      sortOrder: 60
    },
    {
      title: "Мемы первой сессии",
      slug: "first-session-memes",
      description: "Неформальные материалы и картинки, которые не относятся к конспектам или экзаменам.",
      fileUrl: "/2025/1%20сессия/memes/смутно.jpg",
      semesterNumber: 1,
      type: MaterialType.OTHER,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      sortOrder: 70
    }
  ];

  for (const seed of materialSeeds) {
    const semester = await prisma.semester.findUniqueOrThrow({
      where: { number: seed.semesterNumber }
    });
    const subject = seed.subjectSlug
      ? await prisma.subject.findUniqueOrThrow({
          where: {
            directionId_slug: {
              directionId: pi.id,
              slug: seed.subjectSlug
            }
          }
        })
      : null;

    await prisma.material.upsert({
      where: { slug: seed.slug },
      update: {
        title: seed.title,
        description: seed.description,
        externalUrl: seed.externalUrl,
        fileUrl: seed.fileUrl,
        type: seed.type,
        semesterId: semester.id,
        subjectId: subject?.id,
        directionId: pi.id,
        status: MaterialStatus.PUBLISHED,
        publishedAt: seed.publishedAt,
        sortOrder: seed.sortOrder,
        archivedAt: seed.archived ? archivedAt : null
      },
      create: {
        title: seed.title,
        slug: seed.slug,
        description: seed.description,
        type: seed.type,
        status: MaterialStatus.PUBLISHED,
        externalUrl: seed.externalUrl,
        fileUrl: seed.fileUrl,
        semesterId: semester.id,
        subjectId: subject?.id,
        directionId: pi.id,
        authorId: admin.id,
        publishedAt: seed.publishedAt,
        sortOrder: seed.sortOrder,
        archivedAt: seed.archived ? archivedAt : null
      }
    });
  }

  const staticRoot = path.resolve("../static");
  const fileMaterials = await prisma.material.findMany({
    where: { fileUrl: { not: null } },
    select: { id: true, slug: true, description: true, fileUrl: true }
  });
  const manuallyCuratedFileUrls = new Set(
    fileMaterials
      .filter((material) => material.fileUrl && !material.slug.startsWith("file-"))
      .map((material) => normalizeFileUrl(material.fileUrl as string))
  );

  for (const material of fileMaterials) {
    if (
      material.fileUrl &&
      material.slug.startsWith("file-") &&
      material.description === "Файл из материалов курса, добавлен в общий каталог автоматически." &&
      manuallyCuratedFileUrls.has(normalizeFileUrl(material.fileUrl))
    ) {
      await prisma.material.delete({ where: { id: material.id } });
    }
  }

  const existingMaterials = await prisma.material.findMany({
    where: { fileUrl: { not: null } },
    select: { fileUrl: true }
  });
  const seededFileUrls = new Set(existingMaterials.map((material) => material.fileUrl).filter(Boolean).map((fileUrl) => normalizeFileUrl(fileUrl as string)));
  const subjectBySlug = new Map(
    (await prisma.subject.findMany({ where: { directionId: pi.id } })).map((subject) => [subject.slug, subject])
  );
  const discoveredFiles = (await Promise.all(
    ["2024", "2025"].map(async (folder) => {
      try {
        return await listCatalogFiles(path.join(staticRoot, folder));
      } catch {
        return [];
      }
    })
  )).flat();

  let autoSortOrder = 1000;

  for (const filePath of discoveredFiles) {
    if (filePath.includes(`${path.sep}static${path.sep}files${path.sep}`)) {
      continue;
    }

    const fileUrl = publicFileUrl(staticRoot, filePath);
    if (seededFileUrls.has(normalizeFileUrl(fileUrl))) {
      continue;
    }

    const semesterNumber = semesterNumberFromPath(filePath);
    const semester = await prisma.semester.findUnique({
      where: { number: semesterNumber }
    });
    const subjectSlug = subjectSlugFromPath(filePath);
    const subject = subjectSlug ? subjectBySlug.get(subjectSlug) : undefined;
    const yearMatch = filePath.match(new RegExp(`${path.sep}(20\\d{2})${path.sep}`));
    const yearLabel = yearMatch?.[1] ? `${yearMatch[1]}: ` : "";
    const title = `${yearLabel}${titleFromFile(filePath)}`;
    const archived = filePath.includes(`${path.sep}2024${path.sep}`);

    await prisma.material.upsert({
      where: { slug: autoSlugForFile(fileUrl) },
      update: {
        title,
        description: "Файл из материалов курса, добавлен в общий каталог автоматически.",
        fileUrl,
        externalUrl: null,
        type: materialTypeFromPath(filePath),
        semesterId: semester?.id,
        subjectId: subject?.id,
        directionId: pi.id,
        status: MaterialStatus.PUBLISHED,
        publishedAt: new Date("2026-08-30T00:00:00.000Z"),
        sortOrder: autoSortOrder,
        archivedAt: archived ? archivedAt : null
      },
      create: {
        title,
        slug: autoSlugForFile(fileUrl),
        description: "Файл из материалов курса, добавлен в общий каталог автоматически.",
        type: materialTypeFromPath(filePath),
        status: MaterialStatus.PUBLISHED,
        fileUrl,
        semesterId: semester?.id,
        subjectId: subject?.id,
        directionId: pi.id,
        authorId: admin.id,
        publishedAt: new Date("2026-08-30T00:00:00.000Z"),
        sortOrder: autoSortOrder,
        archivedAt: archived ? archivedAt : null
      }
    });

    autoSortOrder += 1;
    seededFileUrls.add(normalizeFileUrl(fileUrl));
  }

  console.log("Seed completed");
  console.log(`Admin login: ${adminEmail}`);
  console.log("Admin password: configured via ADMIN_PASSWORD");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
