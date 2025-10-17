---
applyTo: "**"
---

> You are helping me build a complete **Face Recognition Access Control Web App** using **Next.js (App Router)**, **TypeScript (TSX)**, **Tailwind CSS**, **shadcn/ui**, and **Supabase** (for Auth, Database, Storage, Realtime).
>
> The app should support browser-based face recognition via **face-api.js** or **TensorFlow.js**, and be structured so it can later integrate with a **Raspberry Pi** to unlock a **solenoid door lock** upon successful face recognition.
>
> ---
>
> ### 🧱 Project Overview
>
> - Name: `facebase`
> - Framework: Next.js (TypeScript, App Router)
> - Styling: Tailwind + shadcn/ui
> - Database + Auth + Storage: Supabase
> - Client-side ML: face-api.js / TensorFlow.js
> - Deployment: Vercel (frontend) + Supabase (backend)
>
> ---
>
> ### ⚙️ Core Functional Requirements
>
> 1. **Admin Auth**
>
>    - Admins can login/logout via Supabase Auth.
>    - Role-based access (only admin can manage users).
>
> 2. **Dashboard (/dashboard)**
>
>    - Lists all registered users and visit statistics.
>    - Allows deleting or editing users.
>    - Displays visit logs with thumbnails, timestamps, and “Accepted/Rejected” status.
>
> 3. **Register New User (/register)**
>
>    - Admin can capture multiple face samples using the webcam.
>    - Generate embeddings using face-api.js.
>    - Upload images + embeddings to Supabase Storage and Database.
>
> 4. **Recognition Mode (/recognize)**
>
>    - Uses webcam to detect faces in real time.
>    - Matches them against embeddings from Supabase.
>    - If recognized → mark as “Accepted” and store snapshot + reference user.
>    - If not recognized → mark as “Rejected” and store snapshot.
>    - Log all recognition events in a `visits` table.
>
> 5. **Visitor History (/history)**
>
>    - Displays all visitor entries (accepted or rejected).
>    - Includes snapshot thumbnail, date/time, status, and matched name.
>    - Allows filters by date or status.
>
> 6. **Future Raspberry Pi Integration**
>
>    - Add an API route `/api/facebase` that will later send a webhook or MQTT message to a Raspberry Pi endpoint.
>    - On “Accepted” → Pi unlocks solenoid.
>    - On “Rejected” → door remains locked.
>
> ---
>
> ### 🧩 Database Schema (Supabase)
>
> ```
> users (
>   id uuid primary key,
>   name text,
>   email text unique,
>   role text check (role in ('admin', 'member')),
>   created_at timestamp default now()
> )
>
> faces (
>   id uuid primary key,
>   user_id uuid references users(id),
>   embedding jsonb,
>   image_url text,
>   created_at timestamp default now()
> )
>
> visits (
>   id uuid primary key,
>   timestamp timestamp default now(),
>   status text check (status in ('accepted', 'rejected')),
>   image_url text,
>   matched_user_id uuid references users(id)
> )
> ```
>
> ---
>
> ### 🗂 File Structure
>
> ```
> /app
>   /(auth)/login/page.tsx
>   /dashboard/page.tsx
>   /register/page.tsx
>   /recognize/page.tsx
>   /history/page.tsx
> /lib
>   supabaseClient.ts
>   faceUtils.ts
>   accessControl.ts
> /components
>   WebcamCapture.tsx
>   FaceCard.tsx
>   VisitTable.tsx
> /styles
>   globals.css
> ```
>
> ---
>
> ### 💡 Design Goals
>
> - Clean, modern admin UI (like Google Admin Console).
> - Use shadcn/ui for all tables, cards, and modals.
> - Responsive, works on desktop and mobile.
> - Real-time updates via Supabase Realtime.
> - Future-ready for Raspberry Pi integration.
>
> ---
>
> ### ⚡ Copilot Instructions
>
> - Write all files in **TypeScript (TSX)** syntax.
> - Use **functional components with hooks**.
> - Use **async/await** for all Supabase and ML logic.
> - Keep styles minimal, clean, and consistent.
> - Use comments only where logical explanation is essential (not boilerplate).
> - Generate meaningful placeholder content where real data will come later.
> - Ensure code is easily deployable to **Vercel** and **Supabase** without modification.
>
> ---
>
> ### 🎯 Your Mission
>
> Whenever I ask you to generate a component, page, or utility file:
>
> - Follow this architecture and naming exactly.
> - Automatically include Supabase logic and face recognition utilities.
> - Ensure UI components are responsive and polished.
> - Don’t simplify or omit structure — generate full, working code files.
>
> ---
>
> Once this context is loaded, I’ll begin asking for pages like:
>
> - “Generate `/register/page.tsx` for face capture and embedding upload”
> - “Generate `/recognize/page.tsx` for real-time recognition”
> - “Generate `/history/page.tsx` for visitor log view”
>
> You should respond with complete, valid code following the above structure.

---

### 🪄 How to Use It

1. Open VS Code.
2. Open the **Copilot Chat** panel (right sidebar or press `Ctrl+I` / `Cmd+I`).
3. Paste this entire block into Copilot Chat.
4. Hit **Enter**.

Copilot will now “lock in” this architecture for the session.
You can then start issuing build prompts like:

- “Generate the Supabase client file.”
- “Generate the `/register` page that captures faces and uploads embeddings.”
- “Generate the `/dashboard` page with user table and stats cards.”
