# Tutorship backend

Backend MVP for the tutor-managed materials board.

## What is included

- Public API for directions, semesters and published materials.
- Tutor/admin login with JWT access token and refresh cookie.
- Admin API for creating, editing, publishing, hiding and soft-deleting materials.
- Admin API for tutor accounts.
- Basic file upload endpoint.
- Prisma schema and seed data for the current faculty directions.

## Local start

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Healthcheck:

```bash
curl http://localhost:4000/api/health
```

Seed admin:

```text
email: value from ADMIN_EMAIL, default admin@tutorship.local
password: value from ADMIN_PASSWORD
```

For production, `ADMIN_PASSWORD` is required and seed will fail without it.

## Public endpoints

- `GET /api/health`
- `GET /api/directions`
- `GET /api/semesters`
- `GET /api/materials`
- `GET /api/materials/:slug`

Example:

```bash
curl "http://localhost:4000/api/materials?direction=pi&semester=1"

# Archived materials for one direction
curl "http://localhost:4000/api/materials?direction=pi&archived=true"
```

## Auth endpoints

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Admin endpoints

Require `Authorization: Bearer <accessToken>`.

- `GET /api/admin/materials`
- `GET /api/admin/materials/:id`
- `POST /api/admin/materials`
- `PATCH /api/admin/materials/:id`
- `POST /api/admin/materials/:id/publish`
- `POST /api/admin/materials/:id/unpublish`
- `POST /api/admin/materials/:id/archive`
- `POST /api/admin/materials/:id/unarchive`
- `POST /api/admin/materials/:id/pin`
- `POST /api/admin/materials/:id/unpin`
- `DELETE /api/admin/materials/:id`
- `POST /api/admin/uploads`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id`
- `POST /api/admin/users/:id/disable`

## Create material example

```bash
curl -X POST http://localhost:4000/api/admin/materials \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Новый конспект",
    "description": "Короткое описание",
    "directionSlug": "pi",
    "semesterNumber": 1,
    "type": "NOTES",
    "externalUrl": "https://example.com"
  }'
```

## Next frontend step

The current Hugo page can stay as the visual shell. The next step is to replace static guide cards with a fetch from:

```text
GET http://localhost:4000/api/materials?direction=pi
```

## Archive behavior

Main boards load only non-archived published materials. The folder `Материалы предыдущих годов` loads materials from the same direction with `archived=true`. Tutors can move a material to archive or return it from archive without deleting it.

The seed creates semesters 1-8. Existing seeded PI guides are placed into the archive by default, so a fresh database starts with previous-year materials inside the archive folder.
