import Link from "next/link";

const HomePage = () => (
  <main className="flex min-h-[70vh] flex-col items-center justify-center gap-10 px-6 py-20 text-center sm:px-10">
    <div className="max-w-2xl space-y-4">
      <p className="text-sm font-medium uppercase tracking-[0.35em] text-muted-foreground">
        Face Access Control
      </p>
      <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
        Secure facility access from a single admin console.
      </h1>
      <p className="text-base text-muted-foreground sm:text-lg">
        Register staff, capture embeddings, and monitor visit outcomes in real
        time. Sign in to manage access policies or start recognition straight
        from the browser.
      </p>
    </div>
    <div className="flex flex-col gap-4 sm:flex-row">
      <Link
        href="/login"
        className="rounded-full bg-primary px-6 py-3 text-base font-medium text-primary-foreground transition hover:bg-primary/90">
        Admin sign in
      </Link>
      <Link
        href="/recognize"
        className="rounded-full border border-border px-6 py-3 text-base font-medium transition hover:bg-accent hover:text-accent-foreground">
        Start recognition
      </Link>
    </div>
  </main>
);

export default HomePage;
