import Link from "next/link";
import Image from "next/image";

import AccountRibbon from "@/components/layout/AccountRibbon";
import { getOptionalAdminProfile } from "@/lib/auth";

const features = [
  {
    title: "Guided enrollment",
    description:
      "Capture multi-angle samples, generate embeddings, and sync them to Supabase storage in minutes.",
  },
  {
    title: "Live recognition",
    description:
      "Run face matching in the browser with face-api.js, trigger unlock logic, and log every visit.",
  },
  {
    title: "Actionable history",
    description:
      "Audit accepted and rejected attempts, filter by status, and review captured snapshots instantly.",
  },
  {
    title: "Ready for hardware",
    description:
      "Designed to connect to Raspberry Pi relays so physical doors react the moment someone is identified.",
  },
];

const stats = [
  { value: "98%", label: "Recognition accuracy" },
  { value: "24/7", label: "Live monitoring" },
  { value: "3min", label: "Average enrollment" },
  { value: "∞", label: "Branch scalability" },
];

const HomePage = async () => {
  const profile = await getOptionalAdminProfile();

  return (
    <main className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_55%)]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-primary/15 via-transparent to-transparent blur-3xl" />

      {profile ? (
        <div className="flex justify-end px-6 pt-6 sm:px-10 lg:px-16">
          <AccountRibbon profile={profile} />
        </div>
      ) : null}

      <section className="mx-auto flex min-h-[80vh] w-full max-w-6xl flex-col items-center justify-center gap-14 px-6 py-24 text-center sm:px-10 lg:px-16">
        <div className="flex flex-col items-center gap-6">
          <div className="relative mb-4 h-24 w-24 overflow-hidden rounded-2xl shadow-2xl shadow-primary/20">
            <Image
              src="/logo.png"
              alt="FaceBase"
              fill
              className="object-cover"
            />
          </div>
          <span className="inline-flex items-center rounded-full border border-border/60 bg-background/70 px-4 py-1 text-xs font-medium uppercase tracking-[0.4em] text-muted-foreground">
            facebase
          </span>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            The biometric control room for every secured entrance.
          </h1>
          <p className="max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
            Centrally manage enrollment, recognition, and audit trails across
            your facilities. facebase keeps admins in charge of who gets
            through—and why—in real time.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link
              href={profile ? "/dashboard" : "/login"}
              className="rounded-full bg-primary px-7 py-3 text-base font-medium text-primary-foreground transition hover:bg-primary/90">
              Admin Dashboard
            </Link>
            <Link
              href="/recognize"
              className="rounded-full border border-border px-7 py-3 text-base font-medium transition hover:bg-accent hover:text-accent-foreground">
              Start recognition
            </Link>
          </div>
        </div>

        <div className="w-full rounded-3xl border border-border/60 bg-background/70 p-4 shadow-[0_35px_80px_-45px_rgba(15,23,42,0.6)]">
          <dl className="grid divide-y divide-border/50 text-center sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center gap-2 px-4 py-6">
                <dt className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  {stat.value}
                </dt>
                <dd className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {stat.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-24 sm:px-10 lg:px-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-border/60 bg-background/70 p-6 text-left transition hover:border-primary/60 hover:shadow-lg">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-primary/10 text-primary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="h-5 w-5">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 9.75l6 6 9-13.5"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold sm:text-xl">
                {feature.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
};

export default HomePage;
