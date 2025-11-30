"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import useSWR from "swr";

import type { RecognitionFaceRow } from "@/lib/recognitionData";
import type { VisitStatus } from "@/lib/database.types";
import { mqttClient } from "@/lib/mqtt";
import { 
  useFaceRecognitionEngine, 
  type AccessDecisionEvent, 
  type DetectedFace 
} from "@/hooks/use-face-recognition-engine";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowserClient";

const MODEL_URL = "/models";
const AUTO_SYNC_INTERVAL_MS = 10_000;

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
  const loggingRef = useRef(false);

  const {
    data,
    error: facesError,
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
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const supabase = getSupabaseBrowserClient();

  // --- Helpers ---

  const captureSnapshot = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return null;
    if (video.readyState < 2) return null;

    const maxDimension = 640;
    const { videoWidth, videoHeight } = video;
    const scale = Math.min(1, maxDimension / Math.max(videoWidth, videoHeight));

    canvas.width = Math.round(videoWidth * scale);
    canvas.height = Math.round(videoHeight * scale);
    const context = canvas.getContext("2d");

    if (!context) return null;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  const appendEvent = useCallback((event: RecognitionEvent) => {
    setEvents((previous) => [event, ...previous].slice(0, 15));
  }, []);

  // --- Access Decision Handler ---

  const handleAccessDecision = useCallback(async (event: AccessDecisionEvent) => {
    const { type, reason, matchedUser, faces: decisionFaces } = event;
    const isUnlock = type === "unlock";
    const status: VisitStatus = isUnlock ? "accepted" : "rejected";
    
    // Determine primary user for logging
    const primaryUser = matchedUser ?? null;
    
    // Collect all known names from the detected faces (including banned)
    const recognizedUsers = decisionFaces
      .filter(f => f.status === "known" && f.match?.face?.user?.name)
      .map(f => {
        const name = f.match!.face.user!.name;
        return f.isBanned ? `${name} (Banned)` : name;
      });
      
    const uniqueNames = Array.from(new Set(recognizedUsers));
    
    const userName = uniqueNames.length > 0 
      ? uniqueNames.join(", ") 
      : (primaryUser?.user?.name ?? primaryUser?.user?.email ?? (isUnlock ? "Member" : "Unknown"));

    const userEmail = primaryUser?.user?.email ?? "";
    const isBanned = primaryUser?.user?.is_banned ?? false;

    const logMessage = isUnlock 
      ? `Access granted to ${userName}` 
      : `Access denied: ${reason}`;

    setStatusMessage(logMessage);

    // MQTT Publish
    const mqttResult = isUnlock ? "allowed" : "denied";
    console.log(`Publishing MQTT facebase/access:`, { result: mqttResult, banned: isBanned, user: userName });
    mqttClient.publish("facebase/access", { result: mqttResult, banned: isBanned, user: userName });

    // Log to Supabase
    if (loggingRef.current) return;
    
    const snapshot = captureSnapshot();
    if (!snapshot) return;

    loggingRef.current = true;
    try {
      const response = await fetch("/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          matchedUserId: primaryUser?.user?.id ?? primaryUser?.user_id ?? null,
          image: snapshot,
        }),
      });

      if (!response.ok) throw new Error("Failed to log visit");

      const payload = await response.json();
      
      appendEvent({
        id: payload.visit.id,
        status,
        timestamp: Date.now(),
        message: logMessage,
        userName,
        userEmail,
        isBanned,
        distance: null, // We could pass this if needed
      });
    } catch (error) {
      console.error("Log visit error:", error);
    } finally {
      loggingRef.current = false;
    }
  }, [captureSnapshot, appendEvent]);

  // --- Engine Hook ---

  const { isScanning, setIsScanning, detectedFaces } = useFaceRecognitionEngine({
    videoRef,
    knownFaces: faces,
    modelsLoaded,
    onAccessDecision: handleAccessDecision,
  });

  // --- Canvas Drawing ---

  const clearOverlay = useCallback(() => {
    const overlay = overlayRef.current
    const context = overlay?.getContext("2d");
    if (context && overlay) {
      context.clearRect(0, 0, overlay.width, overlay.height);
    }
  }, []);

  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    const video = videoRef.current;
    if (!overlay || !video) return;

    const context = overlay.getContext("2d");
    if (!context) return;

    const displayWidth = video.clientWidth || video.videoWidth;
    const displayHeight = video.clientHeight || video.videoHeight;
    overlay.width = displayWidth;
    overlay.height = displayHeight;
    context.clearRect(0, 0, overlay.width, overlay.height);

    if (detectedFaces.length === 0) return;

    const videoRatio = video.videoWidth / video.videoHeight;
    const displayRatio = displayWidth / displayHeight;
    let scale = 1, offsetX = 0, offsetY = 0;

    if (displayRatio > videoRatio) {
      scale = displayWidth / video.videoWidth;
      offsetY = (displayHeight - video.videoHeight * scale) / 2;
    } else {
      scale = displayHeight / video.videoHeight;
      offsetX = (displayWidth - video.videoWidth * scale) / 2;
    }

    detectedFaces.forEach((face) => {
      const { box, label, status, isBanned } = face;
      const isRecognized = status === "known";
      const color = isRecognized && !isBanned ? "#10b981" : "#ef4444";

      context.strokeStyle = color;
      context.lineWidth = 2;
      context.setLineDash([10, 5]);

      const drawX = box.x * scale + offsetX;
      const drawY = box.y * scale + offsetY;
      const drawWidth = box.width * scale;
      const drawHeight = box.height * scale;
      const cornerSize = 20;

      context.beginPath();
      context.moveTo(drawX, drawY + cornerSize);
      context.lineTo(drawX, drawY);
      context.lineTo(drawX + cornerSize, drawY);
      context.moveTo(drawX + drawWidth - cornerSize, drawY);
      context.lineTo(drawX + drawWidth, drawY);
      context.lineTo(drawX + drawWidth, drawY + cornerSize);
      context.moveTo(drawX + drawWidth, drawY + drawHeight - cornerSize);
      context.lineTo(drawX + drawWidth, drawY + drawHeight);
      context.lineTo(drawX + drawWidth - cornerSize, drawY + drawHeight);
      context.moveTo(drawX + cornerSize, drawY + drawHeight);
      context.lineTo(drawX, drawY + drawHeight);
      context.lineTo(drawX, drawY + drawHeight - cornerSize);
      context.stroke();

      // Label
      context.font = "600 14px 'Inter', sans-serif";
      context.textBaseline = "top";
      const paddingX = 8;
      const paddingY = 4;
      const metrics = context.measureText(label);
      const textWidth = metrics.width;
      const labelX = drawX;
      const labelY = drawY - 28;

      context.fillStyle = color;
      context.fillRect(labelX, labelY, textWidth + paddingX * 2, 24);
      context.fillStyle = "#ffffff";
      context.fillText(label, labelX + paddingX, labelY + paddingY);
    });
  }, [detectedFaces]);

  // Trigger drawing when faces change
  useEffect(() => {
    requestAnimationFrame(drawOverlay);
  }, [drawOverlay]);

  // --- Effects ---

  useEffect(() => {
    if (data) setLastSyncedAt(new Date());
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
          setActionError("Failed to load recognition models.");
        }
      }
    };
    void loadModels();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const brokerUrl = process.env.NEXT_PUBLIC_MQTT_BROKER_URL;
    if (brokerUrl) {
      mqttClient.connect({
        brokerUrl,
        options: {
          username: process.env.NEXT_PUBLIC_MQTT_USERNAME,
          password: process.env.NEXT_PUBLIC_MQTT_PASSWORD,
          protocol: brokerUrl.startsWith("wss") ? "wss" : "ws",
        },
      });
      mqttClient.subscribe("facebase/motion", (message) => {
        console.log("Motion detected:", message);
        setStatusMessage("Motion detected! Resuming...");
        setIsScanning(true);
      });
    }
    return () => {};
  }, [setIsScanning]);

  useEffect(() => {
    let cancelled = false;
    const startStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (error) {
        setCameraError("Unable to access webcam.");
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

  // Realtime Subscription for Instant Updates
  useEffect(() => {
    const channel = supabase
      .channel("recognition-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        () => {
          console.log("User data changed, refreshing...");
          void mutate();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "faces" },
        () => {
          console.log("Face data changed, refreshing...");
          void mutate();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, mutate]);

  const handleManualSync = useCallback(async () => {
    try {
      setIsManualSyncing(true);
      await mutate(undefined, { revalidate: true });
    } catch (error) {
      setActionError("Failed to refresh data.");
    } finally {
      setIsManualSyncing(false);
    }
  }, [mutate]);

  // --- Render Helpers ---

  // Derive display state from detectedFaces
  const primaryFace = detectedFaces.length > 0 ? detectedFaces[0] : null;
  const matchStatusLabel = primaryFace 
    ? (primaryFace.status === "known" 
        ? (primaryFace.isBanned ? "Banned" : "Recognized") 
        : "Unrecognized")
    : "Scanning";
  
  const matchColorClass = primaryFace
    ? (primaryFace.status === "known" && !primaryFace.isBanned)
      ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/10"
      : "text-red-500 border-red-500/20 bg-red-500/10"
    : "text-muted-foreground bg-muted";

  return (
    <main className="space-y-8 pb-10 relative">
      <LoadingOverlay isLoading={isManualSyncing} message="Syncing with database..." fullScreen />
      <header className="mx-auto w-full max-w-6xl px-6 sm:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">Live Recognition</h1>
              <span className="relative flex h-3 w-3">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${isScanning ? "bg-emerald-400" : "bg-yellow-400"} opacity-75`}></span>
                <span className={`relative inline-flex h-3 w-3 rounded-full ${isScanning ? "bg-emerald-500" : "bg-yellow-500"}`}></span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Real-time access control monitoring.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-xs text-muted-foreground">
              <p>Database: <span className="font-medium text-foreground">{faces.length} faces</span></p>
              <p>Last synced: {lastSyncedAt ? lastSyncedAt.toLocaleTimeString() : "Syncing..."}</p>
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
          {statusMessage && (
             <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-primary">
               {statusMessage}
             </div>
          )}
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-6 sm:px-10 xl:grid-cols-[1fr_350px] xl:h-[calc(100vh-15rem)] xl:min-h-[600px]">
        {/* Main Video Feed */}
        <section className="relative overflow-hidden rounded-3xl border border-border bg-black shadow-2xl h-[400px] sm:h-[500px] xl:h-full">
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
            
            {isScanning && modelsLoaded && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-20">
                <div className="h-full w-full animate-[scan_3s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-emerald-500/10 to-transparent" />
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 p-6">
              <div className="h-full w-full border-[1px] border-white/10">
                <div className="absolute left-0 top-0 h-8 w-8 border-l-2 border-t-2 border-white/50" />
                <div className="absolute right-0 top-0 h-8 w-8 border-r-2 border-t-2 border-white/50" />
                <div className="absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-white/50" />
                <div className="absolute bottom-0 right-0 h-8 w-8 border-b-2 border-r-2 border-white/50" />
              </div>
            </div>

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

          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-white/10 bg-zinc-900/50 px-6 py-4 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${isScanning ? "bg-emerald-500 animate-pulse" : "bg-yellow-500"}`} />
              <span className="text-xs font-medium text-zinc-400">
                {isScanning ? "SYSTEM ACTIVE" : "SYSTEM PAUSED (Idle)"}
              </span>
            </div>
            <button
              onClick={() => setIsScanning((prev) => !prev)}
              className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-white/20">
              {isScanning ? "Pause" : "Resume"}
            </button>
          </div>
        </section>

        {/* Sidebar */}
        <aside className="flex flex-col gap-6 h-full min-h-0">
          <div className="flex-none overflow-hidden rounded-2xl border border-border bg-card shadow-sm h-[360px] xl:h-auto xl:min-h-[320px] xl:flex-[0_0_auto]">
            <div className="border-b border-border bg-muted/50 px-4 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Identification Status
              </h2>
            </div>
            <div className="flex h-full flex-col justify-center p-6">
              {primaryFace ? (
                <div className="flex flex-col items-center text-center">
                  <div className={`mb-4 flex h-20 w-20 items-center justify-center rounded-full border-4 ${matchColorClass}`}>
                    {primaryFace.status === "known" && !primaryFace.isBanned ? (
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
                    {primaryFace.label}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {detectedFaces.length > 1 ? `+${detectedFaces.length - 1} others` : ""}
                  </p>
                  
                  <div className={`mt-4 inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                    primaryFace.status === "known" && !primaryFace.isBanned
                      ? "bg-emerald-500 text-white"
                      : "bg-red-500 text-white"
                  }`}>
                    {matchStatusLabel}
                  </div>

                  <div className="mt-6 grid w-full grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-muted p-2">
                      <p className="text-muted-foreground">Confidence</p>
                      <p className="font-mono font-medium">
                        {primaryFace.match ? `${((1 - primaryFace.match.distance) * 100).toFixed(1)}%` : "N/A"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted p-2">
                      <p className="text-muted-foreground">Faces</p>
                      <p className="font-mono font-medium">{detectedFaces.length}</p>
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
                  <p className="text-sm font-medium text-foreground">
                    {isScanning ? "Scanning..." : "Paused"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isScanning ? "Waiting for face detection" : "System idle"}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex h-[400px] xl:h-auto flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm flex-1 min-h-0">
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

      <canvas ref={canvasRef} className="hidden" />
    </main>
  );
};

export default RecognizeClient;
