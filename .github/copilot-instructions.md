# FaceBase – Copilot Playbook

- **Mission**: Extend the face-access-control admin app described in `.github/instructions/PROMPT.instructions.md`; treat every request as work on that product.
- **Core Stack**: Next.js App Router + TypeScript (convert existing `.js` entry points to `.tsx`/`.ts` when editing), Tailwind CSS 4, shadcn/ui components, Supabase (auth/db/storage/realtime), face-api.js or TensorFlow.js for face embeddings.
- **Directory Map**: Pages live under `src/app` using nested route folders with `page.tsx`; shared UI goes under `src/components`; data/ML helpers stay in `src/lib` (e.g., existing `supabaseClient.ts`, `utils.js`).
- **Styling**: Rely on Tailwind utility classes; use the `cn` helper from `src/lib/utils.js` to merge class names; prefer shadcn/ui primitives for tables, cards, dialogs, and keep styling minimal/consistent.
- **Supabase Access**: Initialize clients via `src/lib/supabaseClient.ts`; expect `SUPABASE_PROJECT_URL`/`SUPABASE_SECRET_KEY` for server-side admin calls and `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` for browser + SSR clients; all Supabase interactions must be `async/await` and typed.
- **Face Recognition**: Use face-api.js (preferred) or tfjs in browser; store embeddings alongside image URLs in Supabase; design APIs/pages so recognition logs visits with accepted/rejected status and snapshots.
- **Planned Routes**: Implement `/dashboard`, `/register`, `/recognize`, `/history`, and `/api/access-control` exactly as scoped; make pages admin-gated via Supabase auth checks.
- **UI Behavior**: Dashboard shows user roster + visit stats; register captures multiple webcam samples; recognize runs webcam loop with live match feedback; history lists visit logs with filters; follow responsive admin-console feel.
- **Raspberry Pi Hook**: `/api/access-control` should emit unlock/deny messages (future webhook/MQTT); structure code now so the handler can call an external integration later.
- **Data Contracts**: Mirror the Supabase schema from PROMPT instructions (`users`, `faces`, `visits` tables); when modeling types, align with those column shapes and include enums for roles/status.
- **Tooling**: Use `npm run dev` (Turbopack), `npm run build`, and `npm run lint`; stick with ESLint config in repo and Tailwind 4 PostCSS pipeline (`components.json` seeds shadcn).
- **Code Style**: Functional React components with hooks, minimal but meaningful comments, avoid placeholder TODOs; keep code deploy-ready for Vercel + Supabase; when in doubt, reference Google Admin aesthetics.
