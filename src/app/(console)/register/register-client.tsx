"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import * as faceapi from "face-api.js";

import FaceCard from "@/components/FaceCard";
import WebcamCapture, { type CapturedSample } from "@/components/WebcamCapture";

interface RegisterClientProps {
  adminName: string;
}

const MODEL_URL = "/models";
const MIN_SAMPLES = 3;

const RegisterClient = ({ adminName }: RegisterClientProps) => {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(
    "Loading face detection models..."
  );
  const [samples, setSamples] = useState<CapturedSample[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        if (!cancelled) {
          setModelsLoaded(true);
          setLoadingMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadingMessage(null);
          setError(
            error instanceof Error
              ? error.message
              : "Failed to load face recognition models. Verify that the model files are hosted under /models."
          );
        }
      }
    };

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, []);

  const addSample = (sample: CapturedSample) => {
    setSamples((previous) => [...previous, sample].slice(-10));
    setError(null);
  };

  const removeSample = (id: string) => {
    setSamples((previous) => previous.filter((sample) => sample.id !== id));
  };

  const resetForm = () => {
    setSamples([]);
    setName("");
    setEmail("");
    setStatus("Registration complete. Ready for the next user.");
  };

  const canSubmit = useMemo(
    () =>
      Boolean(name.trim()) &&
      Boolean(email.trim()) &&
      samples.length >= MIN_SAMPLES &&
      !isSubmitting,
    [email, isSubmitting, name, samples.length]
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      setError("Provide name, email, and capture at least three face samples.");
      return;
    }

    setError(null);
    setStatus("Uploading samples to Supabase...");

    startSubmit(async () => {
      try {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            samples: samples.map((sample) => ({
              image: sample.imageDataUrl,
              embedding: sample.embedding,
            })),
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;

          throw new Error(payload?.error ?? "Failed to register user.");
        }

        resetForm();
      } catch (error) {
        setStatus(null);
        setError(
          error instanceof Error
            ? error.message
            : "Registration failed. Please try again."
        );
      }
    });
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-6 pb-16 pt-6 sm:px-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Register user</h1>
        <p className="text-sm text-muted-foreground">
          Capture at least three face samples to enroll a new member. Models are
          cached locally once loaded. Signed in as {adminName}.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Webcam</h2>
          {loadingMessage ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {loadingMessage}
            </p>
          ) : null}
          <div className="mt-4">
            <WebcamCapture
              modelsLoaded={modelsLoaded}
              onCapture={addSample}
              onError={setError}
              disabled={isSubmitting}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Tip: Position the subject at multiple angles and capture in even
            lighting.
          </p>
        </section>
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Ada Lovelace"
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="ada@example.com"
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Captured samples</h3>
                <span className="text-xs text-muted-foreground">
                  {samples.length}/{MIN_SAMPLES} minimum
                </span>
              </div>
              {samples.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {samples.map((sample, index) => (
                    <FaceCard
                      key={sample.id}
                      sample={sample}
                      index={index}
                      onRemove={isSubmitting ? undefined : removeSample}
                    />
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  No samples captured yet.
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">
              {isSubmitting ? "Registering user..." : "Register user"}
            </button>
          </form>
        </section>
      </div>
      {(error || status) && (
        <div className="rounded-2xl border border-border bg-card px-5 py-4 text-sm shadow-sm">
          {error ? (
            <p className="text-destructive">{error}</p>
          ) : (
            <p className="text-emerald-600">{status}</p>
          )}
        </div>
      )}
    </main>
  );
};

export default RegisterClient;
