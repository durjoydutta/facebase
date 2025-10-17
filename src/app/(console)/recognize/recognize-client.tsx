"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import useSWR from "swr";

import type { RecognitionFaceRow } from "@/lib/recognitionData";
import type { VisitStatus } from "@/lib/database.types";

const MODEL_URL = "/models";
const MATCH_THRESHOLD = 0.5;
const AUTO_SYNC_INTERVAL_MS = 60_000;
const CAPTURE_COOLDOWN_MS = 10_000;

const detectionOptions = new faceapi.TinyFaceDetectorOptions();

interface RecognizeClientProps {
  adminName: string;
  initialFaces: RecognitionFaceRow[];
}

interface RecognitionEvent {
  id: string;
  status: VisitStatus;
  timestamp: number;
  message: string;
  userName: string;
  userEmail: string;
  distance?: number | null;
  isBanned: boolean;
}

interface LiveMatchState {
  status: VisitStatus;
  statusLabel: string;
  userName: string;
  userEmail: string;
  distance: number | null;
  capturedAt: number;
  isBanned: boolean;
}

interface RecognitionFaceDescriptor extends RecognitionFaceRow {
  descriptor: Float32Array;
}

const fetcher = async (url: string): Promise<RecognitionFaceRow[]> => {
  const response = await fetch(url);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    throw new Error(payload?.error ?? "Failed to load recognition data.");
  }

  const payload = (await response.json()) as { faces: RecognitionFaceRow[] };
  return payload.faces;
};

const RecognizeClient = ({ adminName, initialFaces }: RecognizeClientProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastEventRef = useRef<{ identity: string | null; timestamp: number }>({
    identity: null,
    timestamp: 0,
  });
  const loggingRef = useRef(false);

  const {
    data,
    error: facesError,
    isValidating,
    mutate,
  } = useSWR<RecognitionFaceRow[]>("/api/recognize", fetcher, {
    fallbackData: initialFaces,
    refreshInterval: AUTO_SYNC_INTERVAL_MS,
    revalidateOnFocus: true,
  });

  const faces = data ?? initialFaces;

  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(
    "Loading face detection models..."
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<RecognitionEvent[]>([]);
  const [liveMatch, setLiveMatch] = useState<LiveMatchState | null>(null);
  const [isWatching, setIsWatching] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(() => new Date());
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const clearOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    const context = overlay?.getContext("2d");
    if (context && overlay) {
      context.clearRect(0, 0, overlay.width, overlay.height);
    }
  }, []);

  const drawOverlay = useCallback(
    (box: faceapi.Box, label: string, recognized: boolean) => {
      const overlay = overlayRef.current;
      const video = videoRef.current;

      if (!overlay || !video) {
        return;
      }

      const context = overlay.getContext("2d");

      if (!context) {
        return;
      }

      const displayWidth = video.clientWidth || video.videoWidth;
      const displayHeight = video.clientHeight || video.videoHeight;
      overlay.width = displayWidth;
      overlay.height = displayHeight;
      context.clearRect(0, 0, overlay.width, overlay.height);

      const stroke = recognized ? "#22c55e" : "#ef4444";
      context.strokeStyle = stroke;
      context.lineWidth = 5;
      const scaleX = displayWidth / video.videoWidth;
      const scaleY = displayHeight / video.videoHeight;
      const drawX = box.x * scaleX;
      const drawY = box.y * scaleY;
      const drawWidth = box.width * scaleX;
      const drawHeight = box.height * scaleY;
      context.strokeRect(drawX, drawY, drawWidth, drawHeight);

      const displayLabel =
        label.trim() || (recognized ? "Recognized" : "Unknown");
      context.font = "32px sans-serif";
      context.textBaseline = "top";
      const paddingX = 12;
      const paddingY = 6;
      const metrics = context.measureText(displayLabel);
      const textWidth = metrics.width;
      const labelX = Math.max(
        0,
        Math.min(drawX, overlay.width - textWidth - paddingX * 2)
      );
      const labelY = Math.max(0, drawY - 36);

      context.fillStyle = recognized
        ? "rgba(34,197,94,0.85)"
        : "rgba(239,68,68,0.85)";
      context.fillRect(labelX, labelY, textWidth + paddingX * 2, 36);
      context.fillStyle = "#ffffff";
      context.fillText(displayLabel, labelX + paddingX, labelY + paddingY);
    },
    []
  );

  useEffect(() => {
    if (data) {
      setLastSyncedAt(new Date());
    }
  }, [data]);

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      try {
        setLoadingMessage("Loading face detection models...");
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
          setActionError(
            error instanceof Error
              ? error.message
              : "Failed to load recognition models. Verify the /models directory."
          );
        }
      }
    };

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const startStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        setCameraError(
          error instanceof Error
            ? error.message
            : "Unable to access webcam. Check browser permissions."
        );
      }
    };

    void startStream();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const normalizedFaces = useMemo<RecognitionFaceDescriptor[]>(() => {
    return faces.map((face) => ({
      ...face,
      descriptor: new Float32Array(face.embedding),
    }));
  }, [faces]);

  const captureSnapshot = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      return null;
    }

    if (video.readyState < 2) {
      return null;
    }

    const maxDimension = 640;
    const { videoWidth, videoHeight } = video;
    const scale = Math.min(1, maxDimension / Math.max(videoWidth, videoHeight));

    canvas.width = Math.round(videoWidth * scale);
    canvas.height = Math.round(videoHeight * scale);
    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  const appendEvent = useCallback((event: RecognitionEvent) => {
    setEvents((previous) => [event, ...previous].slice(0, 15));
  }, []);

  const logVisit = useCallback(
    async (
      status: VisitStatus,
      matchedUser: RecognitionFaceDescriptor | null,
      distance: number | null
    ) => {
      if (loggingRef.current) {
        return;
      }

      const snapshot = captureSnapshot();

      if (!snapshot) {
        setActionError(
          "Unable to capture snapshot from the webcam. Please adjust the camera and try again."
        );
        return;
      }

      loggingRef.current = true;
      setActionError(null);

      try {
        const response = await fetch("/api/recognize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status,
            matchedUserId:
              matchedUser?.user?.id ?? matchedUser?.user_id ?? null,
            image: snapshot,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;

          throw new Error(payload?.error ?? "Failed to log visit event.");
        }

        const payload = (await response.json()) as {
          visit: {
            id: string;
            timestamp: string;
            status: VisitStatus;
            matched_user_id: string | null;
          };
        };

        const resolvedName =
          matchedUser?.user?.name ?? matchedUser?.user?.email ?? "member";
        const isBanned = matchedUser?.user?.is_banned ?? false;
        const event: RecognitionEvent = {
          id: payload.visit.id,
          status,
          timestamp: new Date(payload.visit.timestamp).getTime(),
          message: isBanned
            ? `Access denied. ${resolvedName} is banned.`
            : status === "accepted"
            ? `Access granted to ${resolvedName}`
            : "Access denied.",
          userName:
            matchedUser?.user?.name ??
            matchedUser?.user?.email ??
            "Unknown visitor",
          userEmail: matchedUser?.user?.email ?? "",
          distance,
          isBanned,
        };

        appendEvent(event);
        setStatusMessage(event.message);
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to log visit. Please try again."
        );
      } finally {
        loggingRef.current = false;
      }
    },
    [appendEvent, captureSnapshot]
  );

  const handleManualSync = useCallback(async () => {
    try {
      setIsManualSyncing(true);
      await mutate(undefined, { revalidate: true });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to refresh recognition data."
      );
    } finally {
      setIsManualSyncing(false);
    }
  }, [mutate]);

  useEffect(() => {
    if (!modelsLoaded || !isWatching) {
      clearOverlay();
      return;
    }

    const video = videoRef.current;

    if (!video) {
      return;
    }

    let cancelled = false;
    let frameId: number;
    let processing = false;

    const analyze = async () => {
      if (cancelled) {
        return;
      }

      frameId = window.requestAnimationFrame(analyze);

      if (processing || !modelsLoaded || !isWatching) {
        return;
      }

      if (video.readyState < 2) {
        return;
      }

      processing = true;

      try {
        const detection = await faceapi
          .detectSingleFace(video, detectionOptions)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!detection) {
          setLiveMatch(null);
          clearOverlay();
          return;
        }

        const { descriptor } = detection;

        let bestMatch: {
          face: RecognitionFaceDescriptor;
          distance: number;
        } | null = null;

        for (const face of normalizedFaces) {
          const distance = faceapi.euclideanDistance(
            face.descriptor,
            descriptor
          );

          if (!bestMatch || distance < bestMatch.distance) {
            bestMatch = { face, distance };
          }
        }

        const matchedFace = bestMatch?.face ?? null;
        const matchedUser = matchedFace?.user ?? null;
        const matchedUserId = matchedUser?.id ?? matchedFace?.user_id ?? null;
        const isBanned = matchedUser?.is_banned ?? false;

        const isRecognized = Boolean(
          bestMatch && bestMatch.distance <= MATCH_THRESHOLD && matchedUserId
        );

        const status: VisitStatus =
          isRecognized && !isBanned ? "accepted" : "rejected";
        const statusLabel = isRecognized
          ? isBanned
            ? "Banned"
            : "Recognized"
          : "Unrecognized";

        const now = Date.now();

        const identityKey = isRecognized
          ? `user:${matchedUserId}:status:${status}`
          : "visitor:unknown";

        const shouldLog =
          now - lastEventRef.current.timestamp > CAPTURE_COOLDOWN_MS ||
          lastEventRef.current.identity !== identityKey;

        const userName = isRecognized
          ? matchedUser?.name ?? matchedUser?.email ?? "Recognized member"
          : "Unknown visitor";
        const userEmail = isRecognized ? matchedUser?.email ?? "" : "";

        const matchState: LiveMatchState = {
          status,
          statusLabel,
          userName,
          userEmail,
          distance: bestMatch?.distance ?? null,
          capturedAt: now,
          isBanned,
        };

        setLiveMatch(matchState);

        const overlayLabel = isRecognized
          ? isBanned
            ? `${userName} (banned)`
            : userName
          : "Unknown";

        drawOverlay(
          detection.detection.box,
          overlayLabel,
          status === "accepted"
        );

        if (shouldLog) {
          lastEventRef.current = { identity: identityKey, timestamp: now };

          await logVisit(
            matchState.status,
            isRecognized ? matchedFace : null,
            bestMatch?.distance ?? null
          );
        }
      } catch (error) {
        setStatusMessage(
          error instanceof Error
            ? error.message
            : "Real-time recognition failed."
        );
        clearOverlay();
      } finally {
        processing = false;
      }
    };

    frameId = window.requestAnimationFrame(analyze);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [
    clearOverlay,
    drawOverlay,
    isWatching,
    logVisit,
    modelsLoaded,
    normalizedFaces,
  ]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      clearOverlay();
    };
  }, [clearOverlay]);

  const faceCount = normalizedFaces.length;
  const lastSyncedLabel = useMemo(
    () => lastSyncedAt.toLocaleTimeString(),
    [lastSyncedAt]
  );

  return (
    <main className="space-y-10">
      <header className="mx-auto w-full max-w-6xl px-6 sm:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Recognition
            </h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {adminName}. Keep the stream running to grant or
              deny access in real time.
            </p>
            <p className="text-xs text-muted-foreground">
              Loaded embeddings: {faceCount}. Model status:{" "}
              {modelsLoaded ? "ready" : "loading"}.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 text-xs text-muted-foreground sm:items-end">
            <span>
              Last synced:{" "}
              <span className="font-medium text-foreground">
                {lastSyncedLabel}
              </span>
            </span>
            <span>Auto-sync every {AUTO_SYNC_INTERVAL_MS / 1000}s</span>
            <button
              type="button"
              onClick={() => void handleManualSync()}
              disabled={isManualSyncing}
              className="mt-1 inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium text-foreground transition hover:border-primary/80 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60">
              {isManualSyncing ? "Syncing..." : "Sync embeddings"}
            </button>
          </div>
        </div>
        {facesError ? (
          <p className="mt-4 rounded-2xl border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {facesError.message}
          </p>
        ) : null}
        {actionError ? (
          <p className="mt-2 rounded-2xl border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {actionError}
          </p>
        ) : null}
        {cameraError ? (
          <p className="mt-2 rounded-2xl border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {cameraError}
          </p>
        ) : null}
        {statusMessage ? (
          <p className="mt-2 rounded-2xl border border-primary bg-primary/10 px-4 py-3 text-sm text-primary">
            {statusMessage}
          </p>
        ) : null}
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-6 pb-16 sm:px-10 lg:grid-cols-[minmax(0,420px)_1fr]">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Live feed</h2>
            <button
              type="button"
              onClick={() => setIsWatching((previous) => !previous)}
              className="rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground transition hover:border-primary/80 hover:text-primary">
              {isWatching ? "Pause recognition" : "Resume recognition"}
            </button>
          </div>
          {loadingMessage ? (
            <p className="text-sm text-muted-foreground">{loadingMessage}</p>
          ) : null}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-muted/40">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-[280px] w-full bg-black object-cover"
            />
            <canvas
              ref={overlayRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
            {isValidating ? (
              <span className="absolute right-3 top-3 rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                Syncing embeddings...
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Position the visitor where lighting is even. Recognition triggers
            once a stable face descriptor is generated.
          </p>
          <canvas ref={canvasRef} className="hidden" />
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Current status</h2>
            {liveMatch ? (
              <div className="mt-4 space-y-2">
                <p
                  className={`text-sm font-medium ${
                    liveMatch.isBanned
                      ? "text-destructive"
                      : liveMatch.status === "accepted"
                      ? "text-emerald-500"
                      : "text-muted-foreground"
                  }`}>
                  {liveMatch.statusLabel}
                </p>
                <p className="text-2xl font-semibold tracking-tight">
                  {liveMatch.userName}
                </p>
                {liveMatch.userEmail ? (
                  <p className="text-sm text-muted-foreground">
                    {liveMatch.userEmail}
                  </p>
                ) : null}
                {liveMatch.isBanned ? (
                  <p className="rounded-full border border-destructive/50 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                    Banned user
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Distance:{" "}
                  {liveMatch.distance !== null
                    ? liveMatch.distance.toFixed(3)
                    : "n/a"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Updated {new Date(liveMatch.capturedAt).toLocaleTimeString()}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Awaiting a clear face in view.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Event log</h2>
              <span className="text-xs text-muted-foreground">
                {events.length} event{events.length === 1 ? "" : "s"} this
                session
              </span>
            </div>
            {events.length ? (
              <ul className="mt-4 space-y-3 text-sm">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-col gap-1 rounded-xl border border-border/60 bg-background/80 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold capitalize">
                        {event.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{event.message}</p>
                    {event.isBanned ? (
                      <span className="inline-flex w-fit items-center gap-1 rounded-full border border-destructive/60 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-destructive">
                        Banned
                      </span>
                    ) : null}
                    {event.distance !== undefined ? (
                      <p className="text-xs text-muted-foreground">
                        Distance:{" "}
                        {event.distance !== null
                          ? event.distance.toFixed(3)
                          : "n/a"}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                No recognition events logged yet this session.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};

export default RecognizeClient;
