"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import useSWR from "swr";

import type { RecognitionFaceRow } from "@/lib/recognitionData";
import type { VisitStatus } from "@/lib/database.types";
import { mqttClient } from "@/lib/mqtt";

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

      const videoRatio = video.videoWidth / video.videoHeight;
      const displayRatio = displayWidth / displayHeight;

      let scale = 1;
      let offsetX = 0;
      let offsetY = 0;

      if (displayRatio > videoRatio) {
        // Display is wider than video: crop top/bottom
        scale = displayWidth / video.videoWidth;
        offsetY = (displayHeight - video.videoHeight * scale) / 2;
      } else {
        // Display is taller than video: crop left/right
        scale = displayHeight / video.videoHeight;
        offsetX = (displayWidth - video.videoWidth * scale) / 2;
      }


      const stroke = recognized ? "#10b981" : "#ef4444"; // Emerald-500 : Red-500
      context.strokeStyle = stroke;
      context.lineWidth = 2;
      context.setLineDash([10, 5]); // Dashed line for tech feel

      const drawX = box.x * scale + offsetX;
      const drawY = box.y * scale + offsetY;
      const drawWidth = box.width * scale;
      const drawHeight = box.height * scale;

      // Draw corners instead of full box for a cleaner look
      const cornerSize = 20;
      context.beginPath();
      // Top-left
      context.moveTo(drawX, drawY + cornerSize);
      context.lineTo(drawX, drawY);
      context.lineTo(drawX + cornerSize, drawY);
      // Top-right
      context.moveTo(drawX + drawWidth - cornerSize, drawY);
      context.lineTo(drawX + drawWidth, drawY);
      context.lineTo(drawX + drawWidth, drawY + cornerSize);
      // Bottom-right
      context.moveTo(drawX + drawWidth, drawY + drawHeight - cornerSize);
      context.lineTo(drawX + drawWidth, drawY + drawHeight);
      context.lineTo(drawX + drawWidth - cornerSize, drawY + drawHeight);
      // Bottom-left
      context.moveTo(drawX + cornerSize, drawY + drawHeight);
      context.lineTo(drawX, drawY + drawHeight);
      context.lineTo(drawX, drawY + drawHeight - cornerSize);
      context.stroke();

      // Label background
      const displayLabel =
        label.trim() || (recognized ? "RECOGNIZED" : "UNKNOWN");
      context.font = "600 14px 'Inter', sans-serif";
      context.textBaseline = "top";
      const paddingX = 8;
      const paddingY = 4;
      const metrics = context.measureText(displayLabel);
      const textWidth = metrics.width;
      const labelX = drawX;
      const labelY = drawY - 28;

      context.fillStyle = recognized ? "#10b981" : "#ef4444";
      context.fillRect(labelX, labelY, textWidth + paddingX * 2, 24);
      
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

  // MQTT Integration
  useEffect(() => {
    const brokerUrl = process.env.NEXT_PUBLIC_MQTT_BROKER_URL;
    const username = process.env.NEXT_PUBLIC_MQTT_USERNAME;
    const password = process.env.NEXT_PUBLIC_MQTT_PASSWORD;

    if (brokerUrl) {
      mqttClient.connect({
        brokerUrl,
        options: {
          username,
          password,
          protocol: brokerUrl.startsWith("wss") ? "wss" : "ws", // Ensure WebSocket protocol
        },
      });

      mqttClient.subscribe("facebase/motion", (message) => {
        console.log("Motion detected:", message);
        setStatusMessage("Motion detected! activating recognition...");
        setIsWatching(true);
      });
    }

    return () => {
      // Optional: disconnect or unsubscribe if needed
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

  // Publish MQTT event when status changes
  const publishAccessResult = useCallback((status: VisitStatus, isBanned: boolean) => {
    const topic = "facebase/access";
    let result = "denied";
    
    if (status === "accepted" && !isBanned) {
      result = "unlocked";
    }

    console.log(`Publishing MQTT ${topic}:`, { result, banned: isBanned });
    mqttClient.publish(topic, { result, banned: isBanned });
  }, []);

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

          publishAccessResult(matchState.status, matchState.isBanned);
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
    <main className="space-y-8 pb-10">
      <header className="mx-auto w-full max-w-6xl px-6 sm:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                Live Recognition
              </h1>
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Real-time access control monitoring.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-xs text-muted-foreground">
              <p>Database: <span className="font-medium text-foreground">{faceCount} faces</span></p>
              <p>Last synced: {lastSyncedLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleManualSync()}
              disabled={isManualSyncing}
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-xs font-medium transition hover:bg-accent hover:text-accent-foreground disabled:opacity-50">
              {isManualSyncing ? "Syncing..." : "Sync Now"}
            </button>
          </div>
        </div>
        
        {/* Status Messages */}
        <div className="mt-4 space-y-2">
           {facesError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {facesError.message}
            </div>
          )}
          {actionError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {actionError}
            </div>
          )}
          {cameraError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {cameraError}
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-6 sm:px-10 lg:grid-cols-[1fr_350px]">
        {/* Main Video Feed */}
        <section className="relative overflow-hidden rounded-3xl border border-border bg-black shadow-2xl h-full">
          <div className="relative h-full w-full overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover transition-opacity duration-700 ${
                modelsLoaded ? "opacity-100" : "opacity-0"
              }`}
            />
            <canvas
              ref={overlayRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
            
            {/* Scanning Animation Overlay */}
            {isWatching && modelsLoaded && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-20">
                <div className="h-full w-full animate-[scan_3s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-emerald-500/10 to-transparent" />
              </div>
            )}

            {/* Viewfinder Corners */}
            <div className="pointer-events-none absolute inset-0 p-6">
              <div className="h-full w-full border-[1px] border-white/10">
                <div className="absolute left-0 top-0 h-8 w-8 border-l-2 border-t-2 border-white/50" />
                <div className="absolute right-0 top-0 h-8 w-8 border-r-2 border-t-2 border-white/50" />
                <div className="absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-white/50" />
                <div className="absolute bottom-0 right-0 h-8 w-8 border-b-2 border-r-2 border-white/50" />
              </div>
            </div>

            {/* Loading State */}
            {!modelsLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  <p className="text-sm font-medium text-muted-foreground">
                    Initializing neural networks...
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Controls Bar */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-white/10 bg-zinc-900/50 px-6 py-4 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${isWatching ? "bg-emerald-500 animate-pulse" : "bg-yellow-500"}`} />
              <span className="text-xs font-medium text-zinc-400">
                {isWatching ? "SYSTEM ACTIVE" : "SYSTEM PAUSED"}
              </span>
            </div>
            <button
              onClick={() => setIsWatching((prev) => !prev)}
              className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-white/20">
              {isWatching ? "Pause" : "Resume"}
            </button>
          </div>
        </section>

        {/* Sidebar */}
        <aside className="flex flex-col gap-6 h-full">
          {/* Current Match Card */}
          <div className="flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm min-h-[320px]">
            <div className="border-b border-border bg-muted/50 px-4 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Identification Status
              </h2>
            </div>
            <div className="flex h-full flex-col justify-center p-6">
              {liveMatch ? (
                <div className="flex flex-col items-center text-center">
                  <div className={`mb-4 flex h-20 w-20 items-center justify-center rounded-full border-4 ${
                    liveMatch.status === "accepted" 
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500" 
                      : "border-red-500/20 bg-red-500/10 text-red-500"
                  }`}>
                    {liveMatch.status === "accepted" ? (
                      <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                  
                  <h3 className="text-xl font-bold text-foreground">
                    {liveMatch.userName}
                  </h3>
                  <p className="text-sm text-muted-foreground">{liveMatch.userEmail}</p>
                  
                  <div className={`mt-4 inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                    liveMatch.status === "accepted"
                      ? "bg-emerald-500 text-white"
                      : "bg-red-500 text-white"
                  }`}>
                    {liveMatch.statusLabel}
                  </div>

                  <div className="mt-6 grid w-full grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-muted p-2">
                      <p className="text-muted-foreground">Confidence</p>
                      <p className="font-mono font-medium">
                        {liveMatch.distance !== null 
                          ? `${((1 - liveMatch.distance) * 100).toFixed(1)}%` 
                          : "N/A"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted p-2">
                      <p className="text-muted-foreground">Time</p>
                      <p className="font-mono font-medium">
                        {new Date(liveMatch.capturedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <svg className="h-8 w-8 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-foreground">Scanning...</p>
                  <p className="text-xs text-muted-foreground">Waiting for face detection</p>
                </div>
              )}
            </div>
          </div>

          {/* Event Log */}
          <div className="flex h-[400px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-muted/50 px-4 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Access Log
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-0">
              {events.length > 0 ? (
                <div className="divide-y divide-border">
                  {events.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 p-4 transition hover:bg-muted/50">
                      <div className={`mt-0.5 h-2 w-2 rounded-full ${
                        event.status === "accepted" ? "bg-emerald-500" : "bg-red-500"
                      }`} />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-foreground">
                            {event.userName}
                          </p>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {event.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
                  No events recorded this session.
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Hidden canvas for snapshot capture */}
      <canvas ref={canvasRef} className="hidden" />
    </main>
  );
};

export default RecognizeClient;
