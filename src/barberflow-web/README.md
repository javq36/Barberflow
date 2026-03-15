# BarberFlow Web (Owner App)

Owner-facing web app for BarberFlow, built with Next.js App Router, Tailwind, shadcn/ui, Redux Toolkit and RTK Query.

## Main Features

- Session-based auth flow through protected proxy routes
- Owner operations modules: services, barbers, customers, schedule, payments
- Unified responsive operations shell (`RoleWorkspaceShell`)
- Centralized UI text catalog in Spanish (`lib/content/texts.es.json`)
- Service image upload support through server-side route + Supabase Storage

## Local Development

From `src/barberflow-web`:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Recommended full-stack flow from repository root:

```bash
npm run dev
```

This runs API + web together with local cleanup.

## Useful Scripts

- `npm run dev`: start web app in development mode
- `npm run build`: production build
- `npm run start`: run production build
- `npm run lint`: run ESLint

## Supabase Storage (Service Images)

Service image uploads use Supabase Storage from server route:

- `app/api/storage/services-image/route.ts`

Set these variables in `src/barberflow-web/.env.local`:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=YOUR_SECRET_KEY
SUPABASE_STORAGE_BUCKET=service-images
```

Notes:

- `NEXT_PUBLIC_SUPABASE_URL` can be used as fallback for `SUPABASE_URL`.
- Publishable/anon key is not enough for this server upload route.
- Keep `SUPABASE_SECRET_KEY` server-only.
- `SUPABASE_SERVICE_ROLE_KEY` is still supported for backward compatibility.

Create bucket `service-images` in Supabase Dashboard.
If you need direct public links, set bucket visibility accordingly.

Recommended object path format:

- `<barbershop_id>/services/<uuid>.<ext>`

## Project Pointers

- Content catalog: `lib/content/texts.es.json`
- Operations shell: `components/dashboard/operations/role-workspace-shell.tsx`
- Role sidebar: `components/dashboard/role-sidebar-nav.tsx`
- Protected proxy: `app/api/protected/[...path]/route.ts`
- Payments page: `app/payments/page.tsx`

## Deployment

Current target environment is local/dev-first while backend and product flows continue evolving.
Production deployment strategy will be documented after environment hardening (secrets, storage policies, and CI checks).
