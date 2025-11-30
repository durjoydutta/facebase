# FaceBase – Face Recognition Access Control Console

![FaceBase Banner](public/images/facebase_banner.png)

FaceBase is an admin-focused access control platform that combines browser-based face recognition with Supabase authentication, storage, and logging. Administrators can enroll users, capture embeddings, run live recognition loops, and review visit history from a unified Next.js console that is future-ready for hardware integrations (e.g., Raspberry Pi door controllers).

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Detailed Workflow](./ARCHITECTURE_AND_WORKFLOW.md) 
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [Supabase Setup](#supabase-setup)
- [Available Scripts](#available-scripts)
- [Face Recognition Models](#face-recognition-models)
- [How Recognition Works](#how-recognition-works)
- [Troubleshooting](#troubleshooting)
- [Deployment Notes](#deployment-notes)

## Features

![FaceBase Features](public/images/facebase_workflow.png)

- **Secure admin authentication** via Supabase Auth with role enforcement (admins only).
- **Dashboard overview** summarizing recent visits, active users, and face sample counts.
- **Guided user enrollment** that captures multiple webcam samples, generates embeddings, and pushes them to Supabase storage + database in one flow.
- **Live recognition console** running entirely in the browser using `face-api.js`, with real-time bounding boxes, user labels, and visit logging.
- **Visit history** with filtering by status/date and thumbnail previews for audits.
- **API surface** (`/api/dashboard`, `/api/recognize`, `/api/faces/[id]`, `/api/register`) tailored for the admin console and future hardware integrations.
- **Responsive UI** built with Tailwind CSS 4 + shadcn/ui, featuring mobile-specific navigation and optimized tables.
- **Supabase-first architecture** that stores embeddings, snapshots, and visit logs while enforcing row level security.

## Tech Stack

- **Framework:** Next.js 15 (App Router, TypeScript)
- **UI:** React 19, Tailwind CSS 4, shadcn/ui components
- **State/Data:** SWR for client-side data refresh; native fetch for API interactions
- **Auth & Data:** Supabase Auth, Database, Storage, and Realtime
- **ML:** `face-api.js` with TinyFaceDetector + face recognition models loaded in the browser
- **Additional tooling:** ESLint 9, Turbopack dev/build pipeline

## Architecture

> **Note:** For a deep dive into the system architecture, hardware integration, and logical workflow, please read the [**Architecture & Workflow Documentation**](./ARCHITECTURE_AND_WORKFLOW.md).

![FaceBase Architecture](public/images/facebase_architecture.png)

```
src/
  app/
	 (auth)/login, update-password        # Public auth flows
	 (console)/dashboard                  # Admin dashboard (server + client components)
	 (console)/register                   # Enrollment UI
	 (console)/recognize                  # Live recognition console
	 (console)/history                    # Visit audit log
	 api/                                 # Admin-only API routes (Next.js Route Handlers)
  components/                            # Reusable UI (WebcamCapture, layout primitives, etc.)
  lib/                                   # Supabase clients, helpers, face recognition utils
public/
  models/                                # face-api.js model weights (TinyFaceDetector, landmarks, recognition)
```

The App Router groups authenticated console routes under `(console)` and public routes under `(auth)`. Layout components handle admin gating server-side before rendering client experiences.

## Prerequisites

- **Node.js** 18.18+ (Next.js 15 requirement) – Node 20 LTS recommended
- **npm** 9+ (ships with newer Node versions)
- **Supabase** project with access to SQL editor, Storage, and Auth templates

## Local Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment variables:** create `.env.local` at the project root (copy from `.env.local.example` if you have one or reference the table below).

3. **Run the dev server:**

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) and sign in with an admin Supabase user.

## Environment Variables

| Variable                        | Required | Description                                                                                                         |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | ✔️       | Supabase project URL (anon client).                                                                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✔️       | Supabase anon/public API key.                                                                                       |
| `SUPABASE_PROJECT_URL`          | ✔️       | Supabase project URL for server-side admin client (defaults to the public URL if omitted).                          |
| `SUPABASE_SECRET_KEY`           | ✔️       | Supabase service role key for server-side operations.                                                               |
| `NEXT_DEPLOYED_URL`             | ➖       | Optional fully-qualified deployment URL used for password reset redirects (falls back to `window.location.origin`). |
| `NEXT_PUBLIC_MQTT_BROKER_URL` | ✔️       | MQTT Broker URL (wss://... for browser).                                                                            |
| `NEXT_PUBLIC_MQTT_USERNAME`   | ➖       | MQTT Username.                                                                                                      |
| `NEXT_PUBLIC_MQTT_PASSWORD`   | ➖       | MQTT Password.                                                                                                      |
| `RASPBERRY_PI_WEBHOOK_URL`    | ❌       | (Deprecated) No longer used.                                                                                        |
| `RASPBERRY_PI_SHARED_SECRET`  | ❌       | (Deprecated) No longer used.                                                                                        |

> **Security note:** Never expose `SUPABASE_SECRET_KEY` to the browser; it is only read in server components and API routes.

## Supabase Setup

Run the schema and policy SQL in `./.github/instructions/SCHEMA.instructions.md` (or paste the snippet below) within the Supabase SQL editor to create the required tables and security policies:

```sql
-- Users, faces, visits tables and policies
-- (See SCHEMA.instructions.md for the complete script.)
```

Key pieces:

- **Tables:** `users`, `faces`, `visits` with the columns described in the project brief.
- **Buckets:** create Storage buckets named `faces` and `visit-snapshots`. Both must allow uploads via the service role key.
- **Auth trigger:** the SQL script wires `auth.users` inserts to auto-provision rows in `public.users` with a default `member` role. Promote admins by updating the `role` column to `admin` manually or via SQL.

## Available Scripts

| Command         | Description                                                        |
| --------------- | ------------------------------------------------------------------ |
| `npm run dev`   | Start the Next.js dev server with Turbopack.                       |
| `npm run build` | Create an optimized production build (also runs type/lint checks). |
| `npm run start` | Serve the production build locally.                                |
| `npm run lint`  | Run ESLint across the repo.                                        |

## Face Recognition Models

The project expects pretrained `face-api.js` weights under `public/models/`:

- `tiny_face_detector_model-weights_manifest.json` + shard(s)
- `face_landmark_68_model-weights_manifest.json` + shard(s)
- `face_recognition_model-weights_manifest.json` + shard(s)

These files are already tracked in the repo. If you need to refresh them, download the latest weights from the `face-api.js` GitHub releases and place them in `public/models/` using the same filenames.

## How Recognition Works

1. **Enrollment (/register):**

   - The webcam capture component runs TinyFaceDetector to draw live bounding boxes.

- **Large payload errors** when uploading snapshots: the capture pipeline downscales frames to ≤640px and exports JPEG at 0.85 quality. If you still hit Supabase function payload limits, lower quality in `WebcamCapture.tsx` or configure Supabase Edge Function limits.
- **Models fail to load:** ensure `public/models` files are deployed and accessible (case-sensitive paths). Check your deployment URL – face-api.js loads models via `fetch('/models/...')`.
- **Admins redirected to login:** confirm the user’s `role` equals `admin` in `public.users`. The layout guard redirects non-admins away from console routes.
- **Password reset links go to the wrong page:** set `NEXT_DEPLOYED_URL` to your production base URL so Supabase sends `/update-password` links correctly.

## Deployment Notes

- **Frontend:** Deploy the Next.js app (e.g., Vercel). Ensure the `NEXT_PUBLIC_SUPABASE_*` variables and `NEXT_DEPLOYED_URL` are configured in the hosting environment.
- **Backend:** Supabase handles auth, database, storage, and RLS policies. No custom server is required.
- **Edge caching:** API routes like `/api/dashboard` are marked `force-dynamic` where necessary to ensure up-to-date data.
- **Future hardware integrations:** The system now uses MQTT for real-time communication. The Next.js app publishes access decisions to `facebase/access` and listens for motion on `facebase/motion`. See `raspberry/README.md` for the Pi client setup.

---
