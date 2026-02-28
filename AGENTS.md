# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Next.js App Router pages, API route handlers (`app/api/*`), and the Studio UI (`app/studio/page.tsx`).
- `components/`: UI components (canvas, panels, shared primitives).
- `lib/`: utilities, data helpers, and API clients.
- `store/`: Zustand state management.
- `prisma/`: Prisma schema and migrations.
- `public/`: static assets (e.g., `public/preview.png`).
- `scripts/`: maintenance scripts (e.g., `scripts/test-db.js`).
- `doc/`: product and design docs.

## Build, Test, and Development Commands
- `npm run dev`: start the Next.js dev server.
- `npm run build`: production build.
- `npm run start`: serve the built app.
- `npm run lint`: run ESLint.
- `npm run prisma:generate`: generate the Prisma client.
- `npm run prisma:migrate -- --name <name>`: apply a dev migration.
- `node scripts/test-db.js`: check Postgres connectivity using `DIRECT_URL`.

## Coding Style & Naming Conventions
- TypeScript/React with Next.js App Router. Use 2-space indentation, semicolons, and double quotes as seen in `app/` files.
- Prefer `PascalCase` for React components and types, `camelCase` for variables/functions, and `kebab-case` for file names unless the existing folder uses a different pattern.
- Tailwind CSS v4 for styling; use `clsx` + `tailwind-merge` for conditional class composition.
- Run `npm run lint` before pushing; ESLint config lives in `eslint.config.mjs`.

## Testing Guidelines
- No automated test runner is configured in `package.json` yet.
- For database-related changes, validate connectivity with `node scripts/test-db.js`.
- If you add a test framework, update this file with the command and location conventions.

## Commit & Pull Request Guidelines
- Commit history is mixed: recent commits use Conventional Commits (`feat:`, `feat(canvas):`), older entries are free-form (`init`, `V1 of ermiz`, `readme update`).
- For new work, prefer Conventional Commits and include a short, specific summary; add a scope when it clarifies the area.
- PRs should include a clear description, linked issues (if any), and screenshots for UI changes. Call out Prisma migrations and any new env vars.

## Security & Configuration
- Environment variables live in `.env`; use `.env.example` as the template.
- Supabase keys and database URLs must not be committed. Document any new required env vars in `.env.example`.
