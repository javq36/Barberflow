This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Supabase Storage (Service Images)

Service image uploads use Supabase Storage from the server route
`app/api/storage/services-image/route.ts`.

Set these variables in `src/barberflow-web/.env.local`:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=YOUR_SECRET_KEY
SUPABASE_STORAGE_BUCKET=service-images
```

Notes:

- `NEXT_PUBLIC_SUPABASE_URL` can be used as a fallback for `SUPABASE_URL`.
- A publishable/anon key is not enough for this server upload route.
- Keep `SUPABASE_SECRET_KEY` server-only (never expose it in client code).
- `SUPABASE_SERVICE_ROLE_KEY` is still supported for backward compatibility.

Create a bucket named `service-images` in Supabase Dashboard.
If you want direct public image URLs to work, configure the bucket as public.

Recommended path format used by uploads:

`<barbershop_id>/services/<uuid>.<ext>`

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
