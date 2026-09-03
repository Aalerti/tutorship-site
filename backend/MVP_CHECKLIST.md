# Backend MVP checklist

Rollback point before backend MVP: `a5ea782`.

## Implemented

- Fastify backend project in `backend/`.
- TypeScript config and production build script.
- Prisma schema for users, directions, semesters, materials, attachments and audit logs.
- Initial SQL migration.
- Seed script with six directions, three semesters, first admin and initial PI guide cards.
- Public API:
  - `GET /api/health`;
  - `GET /api/directions`;
  - `GET /api/semesters`;
  - `GET /api/materials`;
  - `GET /api/materials/:slug`.
- Auth API:
  - `POST /api/auth/login`;
  - `POST /api/auth/refresh`;
  - `POST /api/auth/logout`;
  - `GET /api/auth/me`.
- Tutor/admin API for materials:
  - list hidden and published materials;
  - create material;
  - edit material;
  - publish material;
  - hide material;
  - soft delete material.
- Admin API for users:
  - list users;
  - create tutor/admin;
  - update user;
  - disable user.
- Basic upload endpoint with extension allowlist and 50 MB multipart limit.
- Dockerfile for backend.
- Docker Compose services for web, backend and PostgreSQL.

## Verified before environment limit

- `npm install` completed.
- `npm run prisma:generate` completed.
- `npm run lint` completed.
- `npm run build` completed.

## Not verified in this run

- Runtime server start after compaction, because shell execution started failing with sandbox `bwrap` and escalated launch was rejected by the current usage limit.
- Real PostgreSQL migration against a running database.
- End-to-end API calls with seeded database.

## Next practical step

When shell execution is available again:

```bash
cd backend
cp .env.example .env
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Then check:

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/materials?direction=pi
```

## Rollback

To return to the state before backend MVP:

```bash
git reset --hard a5ea782
```

Use this only if we deliberately decide to throw away the backend MVP commits.
