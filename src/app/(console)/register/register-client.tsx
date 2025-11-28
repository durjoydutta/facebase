"use client";
import { Upload } from "lucide-react";

import { useEffect, useMemo, useState, useTransition } from "react";
import * as faceapi from "face-api.js";
import useSWR from "swr";

import FaceCard from "@/components/FaceCard";
import WebcamCapture, { type CapturedSample } from "@/components/WebcamCapture";
import { LoadingOverlay } from "@/components/LoadingOverlay";

type ExtendedSample = CapturedSample & { isExisting?: boolean };

interface RegisterClientProps {
  adminName: string;
  initialName?: string;
  initialEmail?: string;
}

const MODEL_URL = "/models";
const MIN_SAMPLES = 3;

// Helper to load image from file
const loadImageFromFile = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => resolve(img);
    img.onerror = reject;
  });
};

const RegisterClient = ({
  adminName,
  initialName,
  initialEmail,
}: RegisterClientProps) => {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(
    "Loading face detection models..."
  );
  const [samples, setSamples] = useState<ExtendedSample[]>([]);
  const [baselineName, setBaselineName] = useState(initialName ?? "");
  const [baselineEmail, setBaselineEmail] = useState(initialEmail ?? "");
  const [name, setName] = useState(initialName ?? "");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();
  const [isPrefilled, setIsPrefilled] = useState(
    Boolean(initialName || initialEmail)
  );
  const [existingFaceCount, setExistingFaceCount] = useState(0);

  useEffect(() => {
    const resolvedName = initialName ?? "";
    const resolvedEmail = initialEmail ?? "";
    setBaselineName(resolvedName);
    setBaselineEmail(resolvedEmail);
    setName(resolvedName);
    setEmail(resolvedEmail);
    setIsPrefilled(Boolean(initialName || initialEmail));
  }, [initialEmail, initialName]);

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

  const removeSample = async (id: string) => {
    const sampleToRemove = samples.find((s) => s.id === id);
    if (sampleToRemove?.isExisting) {
      if (!confirm("Are you sure you want to delete this existing sample? This cannot be undone.")) {
        return;
      }
      try {
        const res = await fetch(`/api/faces/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete face sample");
        // Update existing count locally to reflect deletion immediately
        setExistingFaceCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        console.error(err);
        alert("Failed to delete sample");
        return;
      }
    }
    setSamples((previous) => previous.filter((sample) => sample.id !== id));
  };

  const resetForm = () => {
    setSamples([]);
    setName(baselineName);
    setEmail(baselineEmail);
    // Don't reset existingFaceCount here as we might still be on the same user? 
    // Actually, usually we reset to "New User" state or keep current?
    // The original code kept baseline if isPrefilled.
    // But if we just registered, maybe we should update the count?
    // For now, let's just keep the form reset behavior.
    setStatus(
      isPrefilled
        ? "Face samples updated. Ready when you are for another capture."
        : "Registration complete. Ready for the next user."
    );
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setLoadingText("Processing uploaded images...");
    setStatus("Processing uploaded images...");

    let processedCount = 0;
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const img = await loadImageFromFile(file);
        
        // Detect face
        const detection = await faceapi
          .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) {
          // Create canvas to get clean data URL (and potentially resize if needed)
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const imageDataUrl = canvas.toDataURL("image/jpeg", 0.9);
            
            addSample({
              id: crypto.randomUUID(),
              imageDataUrl,
              embedding: Array.from(detection.descriptor),
              createdAt: Date.now(),
            });
            successCount++;
          }
        } else {
          console.warn(`No face detected in ${file.name}`);
        }
      } catch (err) {
        console.error(`Error processing ${file.name}:`, err);
      }
      processedCount++;
    }

    setLoadingText(null);
    setStatus(null);
    if (successCount === 0) {
      setError("No valid faces detected in uploaded images. Please try clearer photos.");
    } else if (successCount < files.length) {
      setError(`Processed ${successCount}/${files.length} images. Some images had no detectable faces.`);
    }
    
    // Reset input
    event.target.value = "";
  };

  const canSubmit = useMemo(
    () =>
      Boolean(name.trim()) &&
      Boolean(email.trim()) &&
      (existingFaceCount + samples.length >= MIN_SAMPLES) &&
      !isSubmitting,
    [email, existingFaceCount, isSubmitting, name, samples.length]
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      setError("Provide name, email, and capture at least three face samples.");
      return;
    }

    setError(null);
    setLoadingText("Uploading samples to Supabase...");
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
            samples: samples
              .filter((s) => !s.isExisting)
              .map((sample) => ({
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
      finally {
        setLoadingText(null);
      }
    });
  };

  const { data: usersData } = useSWR<{ users: { id: string; name: string; email: string; faces: { count: number }[] }[] }>(
    "/api/users",
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    }
  );

  const handleUserSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const userId = e.target.value;
    if (!userId) {
      setIsPrefilled(false);
      setBaselineName("");
      setBaselineEmail("");
      setName("");
      setEmail("");
      setExistingFaceCount(0);
      return;
    }

    const user = usersData?.users.find((u) => u.id === userId);
    if (user) {
      setIsPrefilled(true);
      setBaselineName(user.name);
      setBaselineEmail(user.email);
      setName(user.name);
      setEmail(user.email);
      setExistingFaceCount(user.faces?.[0]?.count ?? 0);

      // Fetch existing faces
      setLoadingText("Fetching user details...");
      fetch(`/api/users/${userId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.user?.faces) {
            const existingSamples: ExtendedSample[] = data.user.faces.map((f: any) => ({
              id: f.id,
              imageDataUrl: f.image_url,
              embedding: f.embedding, // Note: FaceCard doesn't use embedding, but we keep it for consistency
              createdAt: new Date(f.created_at).getTime(),
              isExisting: true,
            }));
            setSamples(existingSamples);
          }
        })
        .catch((err) => console.error("Failed to fetch existing faces", err))
        .finally(() => setLoadingText(null));
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-6 pb-16 pt-6 sm:px-10 relative">
      <LoadingOverlay isLoading={!!loadingText} message={loadingText || ""} fullScreen />
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Register / Update User
        </h1>
        <p className="text-sm text-muted-foreground">
          Capture at least three face samples to enroll a new member. Models are
          cached locally once loaded. Signed in as {adminName}.
        </p>
        {isPrefilled ? (
          <p className="text-xs text-primary">
            Updating samples for {initialName ?? initialEmail}.
          </p>
        ) : null}
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
          
          <div className="mt-4 flex items-center justify-center">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">OR</span>
          </div>

          <div className="mt-4">
            <label
              htmlFor="file-upload"
              className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/50 px-4 py-8 text-sm font-medium transition hover:bg-muted ${
                !modelsLoaded || isSubmitting ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-muted-foreground">Upload from Gallery</span>
              <input
                id="file-upload"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileUpload}
                disabled={!modelsLoaded || isSubmitting}
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Tip: Position the subject at multiple angles and capture in even
            lighting.
          </p>
        </section>
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="user-select">
                Select Existing User (Optional)
              </label>
              <select
                id="user-select"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={handleUserSelect}
                value={isPrefilled && usersData?.users.find(u => u.email === email)?.id || ""}
              >
                <option value="">-- Register New User --</option>
                {usersData?.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Ada Lovelace"
                autoComplete="off"
                required
                disabled={isPrefilled}
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
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="ada@example.com"
                autoComplete="off"
                required
                disabled={isPrefilled}
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Captured samples</h3>
                <span className="text-xs text-muted-foreground">
                  {existingFaceCount < MIN_SAMPLES
                    ? `${samples.length}/${Math.max(1, MIN_SAMPLES - existingFaceCount)}`
                    : `${samples.length} samples`}
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
              {isSubmitting
                ? isPrefilled
                  ? "Updating User..."
                  : "Registering User..."
                : isPrefilled
                  ? "Update User"
                  : "Register User"}
            </button>
            {isPrefilled ? (
              <button
                type="button"
                onClick={() => {
                  setIsPrefilled(false);
                  setBaselineName("");
                  setBaselineEmail("");
                  setName("");
                  setEmail("");
                  setExistingFaceCount(0);
                }}
                className="w-full text-xs font-medium text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline">
                Clear pre-filled details
              </button>
            ) : null}
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
