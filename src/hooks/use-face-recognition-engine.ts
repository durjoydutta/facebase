import { useCallback, useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import type { RecognitionFaceRow } from "@/lib/recognitionData";
import type { VisitStatus } from "@/lib/database.types";

// --- Configuration Constants ---
const ACCEPTED_COOLDOWN_MS = 8_000;
const UNKNOWN_COOLDOWN_MS = 3_000;
const DISAPPEAR_RESET_MS = 2_000;
const UI_PERSISTENCE_MS = 500;
const AUTO_PAUSE_TIMEOUT_MS = 60_000; // 1 minute
const MATCH_THRESHOLD = 0.45;
const MIN_PERSISTENCE_FRAMES = 3;

// --- Types ---

export interface DetectedFace {
  box: faceapi.Box;
  descriptor: Float32Array;
  match: {
    face: RecognitionFaceRow;
    distance: number;
  } | null;
  status: "known" | "unknown";
  label: string;
  isBanned: boolean;
}

export interface AccessDecisionEvent {
  type: "unlock" | "deny";
  reason: string;
  faces: DetectedFace[];
  timestamp: number;
  matchedUser?: RecognitionFaceRow; // For unlock events
}

export interface UseFaceRecognitionEngineProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  knownFaces: RecognitionFaceRow[];
  modelsLoaded: boolean;
  onAccessDecision: (event: AccessDecisionEvent) => void;
}

export const useFaceRecognitionEngine = ({
  videoRef,
  knownFaces,
  modelsLoaded,
  onAccessDecision,
}: UseFaceRecognitionEngineProps) => {
  const [isScanning, setIsScanning] = useState(true);
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
  
  // --- Internal State Refs ---
  
  // Cooldown Management
  const lastUnlockTimeRef = useRef<Map<string, number>>(new Map());
  const lastUnknownRejectTimeRef = useRef<number>(0);
  
  // Presence / Session Management
  // Track how long faces have been visible (for persistence)
  // We use a simplified approach: if faces are present, we count persistence frames.
  // If faces disappear for > DISAPPEAR_RESET_MS, we reset presence state.
  const lastFacesSeenTimeRef = useRef<number>(Date.now());
  
  const lastFaceDetectedTimeRef = useRef<number>(Date.now()); // For Auto-Pause
  
  const decisionBufferRef = useRef<{
    type: "unlock" | "deny" | "none";
    count: number;
    candidateUser?: RecognitionFaceRow;
    reason?: string;
  }>({ type: "none", count: 0 });

  const normalizedKnownFaces = useRef<
    { descriptor: Float32Array; data: RecognitionFaceRow }[]
  >([]);

  useEffect(() => {
    normalizedKnownFaces.current = knownFaces.map((face) => ({
      descriptor: new Float32Array(face.embedding),
      data: face,
    }));
  }, [knownFaces]);

  // --- Core Recognition Loop ---
  useEffect(() => {
    if (!modelsLoaded || !videoRef.current) return;

    let animationFrameId: number;
    let isProcessing = false;
    let isActive = true;

    const processFrame = async () => {
      if (!isActive || !isScanning) return;

      if (isProcessing) {
        animationFrameId = requestAnimationFrame(processFrame);
        return;
      }
      
      const now = Date.now();
      
      // Auto-Pause Check
      if (now - lastFaceDetectedTimeRef.current > AUTO_PAUSE_TIMEOUT_MS) {
        setIsScanning(false);
        return;
      }

      const video = videoRef.current;
      if (!video || video.paused || video.ended || video.readyState < 2) {
        animationFrameId = requestAnimationFrame(processFrame);
        return;
      }

      isProcessing = true;

      try {
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptors();

        if (!isActive || !isScanning) return;

        // --- Disappear Reset Logic ---
        // If no faces seen for DISAPPEAR_RESET_MS, reset decision buffer & presence
        // Note: We do NOT clear lastUnlockTimeRef (cooldowns persist)
        if (detections.length === 0) {
          const timeSinceLastFace = now - lastFacesSeenTimeRef.current;

          if (timeSinceLastFace > DISAPPEAR_RESET_MS) {
             decisionBufferRef.current = { type: "none", count: 0 };
          }

          // Prevent UI flickering by holding state for a short time
          if (timeSinceLastFace < UI_PERSISTENCE_MS) {
            return;
          }

          setDetectedFaces([]);
          return;
        }

        // Faces present
        lastFacesSeenTimeRef.current = now;
        lastFaceDetectedTimeRef.current = now;

        // --- Matching & Classification ---
        const currentFaces: DetectedFace[] = [];
        let hasUnknown = false;
        let hasKnown = false;
        let allKnown = true;
        let allUnknown = true;
        
        // Candidates for unlock (known, not banned)
        const unlockCandidates: { face: RecognitionFaceRow; distance: number }[] = [];
        let anyBanned = false;

        for (const detection of detections) {
          let bestMatch: { face: RecognitionFaceRow; distance: number } | null = null;

          for (const known of normalizedKnownFaces.current) {
            const distance = faceapi.euclideanDistance(
              detection.descriptor,
              known.descriptor
            );
            if (distance < MATCH_THRESHOLD) {
              if (!bestMatch || distance < bestMatch.distance) {
                bestMatch = { face: known.data, distance };
              }
            }
          }

          const isKnown = !!bestMatch;
          const isBanned = bestMatch?.face.user?.is_banned ?? false;
          
          if (isBanned) {
            anyBanned = true;
          }

          if (isKnown) {
            hasKnown = true;
            allUnknown = false;
            if (!isBanned && bestMatch) {
              unlockCandidates.push(bestMatch);
            }
          } else {
            hasUnknown = true;
            allKnown = false;
          }

          const faceData: DetectedFace = {
            box: detection.detection.box,
            descriptor: detection.descriptor,
            match: bestMatch,
            status: isKnown ? "known" : "unknown",
            label: isKnown
              ? (bestMatch?.face.user?.name ?? "Recognized") + (isBanned ? " (BANNED)" : "")
              : "Unknown",
            isBanned,
          };
          currentFaces.push(faceData);
        }

        setDetectedFaces(currentFaces);

        // --- Aggregation Rules & Decision Logic ---
        let proposedDecision: "unlock" | "deny" | "none" = "none";
        let decisionCandidate: RecognitionFaceRow | undefined = undefined;
        let decisionReason = "";

        // 0. Banned User Detected -> DENY ALWAYS (Highest Priority)
        if (anyBanned) {
             proposedDecision = "deny";
             decisionReason = "Group contains banned user";
             // Find the banned user to set as candidate for logging
             const bannedFace = currentFaces.find(f => f.isBanned);
             if (bannedFace && bannedFace.match) {
                 decisionCandidate = bannedFace.match.face;
             }
        }
        // 1. Mixed Known + Unknown -> DENY ALWAYS
        else if (hasKnown && hasUnknown) {
          // Check unknown cooldown
          if (now - lastUnknownRejectTimeRef.current >= UNKNOWN_COOLDOWN_MS) {
            proposedDecision = "deny";
            decisionReason = "Mixed group detected (Security Alert)";
          }
        }
        // 2. Multiple Unknown -> DENY
        else if (allUnknown && detections.length > 1) {
           if (now - lastUnknownRejectTimeRef.current >= UNKNOWN_COOLDOWN_MS) {
            proposedDecision = "deny";
            decisionReason = "Multiple unknown faces";
          }
        }
        // 3. Single Unknown -> DENY
        else if (allUnknown && detections.length === 1) {
           if (now - lastUnknownRejectTimeRef.current >= UNKNOWN_COOLDOWN_MS) {
            proposedDecision = "deny";
            decisionReason = "Unknown face detected";
          }
        }
        // 4. Multiple All Known -> UNLOCK (Highest Confidence)
        else if (allKnown && detections.length > 1) {
           // Sort candidates by distance (ascending = higher confidence)
           unlockCandidates.sort((a, b) => a.distance - b.distance);
           const best = unlockCandidates[0]; // Highest confidence
           
           if (best) {
             const userId = best.face.user?.id ?? best.face.user_id;
             const lastUnlock = lastUnlockTimeRef.current.get(userId) || 0;
             
             if (now - lastUnlock >= ACCEPTED_COOLDOWN_MS) {
               proposedDecision = "unlock";
               decisionCandidate = best.face;
               decisionReason = "Recognized (Multi-face)";
             }
           } else {
             // All known but all banned?
             // Find the best match among all current faces
             let bestAny: { face: RecognitionFaceRow; distance: number } | null = null;
             
             for (const face of currentFaces) {
                if (face.match && (!bestAny || face.match.distance < bestAny.distance)) {
                    bestAny = face.match;
                }
             }

             proposedDecision = "deny";
             decisionReason = "Access denied (Banned)";
             if (bestAny) {
                 decisionCandidate = bestAny.face;
             }
           }
        }
        // 5. Single Recognized -> UNLOCK
        else if (allKnown && detections.length === 1) {
           const best = unlockCandidates[0];
           if (best) {
             const userId = best.face.user?.id ?? best.face.user_id;
             const lastUnlock = lastUnlockTimeRef.current.get(userId) || 0;
             
             if (now - lastUnlock >= ACCEPTED_COOLDOWN_MS) {
               proposedDecision = "unlock";
               decisionCandidate = best.face;
               decisionReason = "Face recognized";
             }
           } else {
             // Banned
             // The single detection must be the banned user
             const face = currentFaces[0];
             proposedDecision = "deny";
             decisionReason = "Access denied (Banned)";
             if (face && face.match) {
                 decisionCandidate = face.match.face;
             }
           }
        }

        // --- Persistence Buffer ---
        if (proposedDecision === decisionBufferRef.current.type && proposedDecision !== "none") {
          decisionBufferRef.current.count++;
          // Update candidate/reason if needed (usually same)
          if (proposedDecision === "unlock") {
             decisionBufferRef.current.candidateUser = decisionCandidate;
          }
          decisionBufferRef.current.reason = decisionReason;
        } else {
          // Reset buffer if decision changes
          decisionBufferRef.current = { 
            type: proposedDecision, 
            count: 1, 
            candidateUser: decisionCandidate,
            reason: decisionReason
          };
        }

        // --- Execute Decision ---
        if (decisionBufferRef.current.count >= MIN_PERSISTENCE_FRAMES) {
          const decision = decisionBufferRef.current.type;
          
          if (decision === "unlock" && decisionBufferRef.current.candidateUser) {
            const user = decisionBufferRef.current.candidateUser;
            const userId = user.user?.id ?? user.user_id;
            
            // Final Cooldown Check (Double check before emitting)
            const lastUnlock = lastUnlockTimeRef.current.get(userId) || 0;
            if (now - lastUnlock >= ACCEPTED_COOLDOWN_MS) {
               onAccessDecision({
                type: "unlock",
                reason: decisionBufferRef.current.reason || "Recognized",
                faces: currentFaces,
                timestamp: now,
                matchedUser: user,
              });
              lastUnlockTimeRef.current.set(userId, now);
              decisionBufferRef.current.count = 0; // Reset buffer after action
            }
          } else if (decision === "deny") {
             // Final Cooldown Check for Unknown
             if (now - lastUnknownRejectTimeRef.current >= UNKNOWN_COOLDOWN_MS) {
                onAccessDecision({
                  type: "deny",
                  reason: decisionBufferRef.current.reason || "Access denied",
                  faces: currentFaces,
                  timestamp: now,
                  matchedUser: decisionBufferRef.current.candidateUser, // Pass banned user if available
                });
                lastUnknownRejectTimeRef.current = now;
                decisionBufferRef.current.count = 0;
             }
          }
        }

      } catch (err) {
        console.error("Recognition loop error:", err);
      } finally {
        isProcessing = false;
        if (isActive && isScanning) {
          animationFrameId = requestAnimationFrame(processFrame);
        }
      }
    };

    animationFrameId = requestAnimationFrame(processFrame);

    return () => {
      isActive = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [isScanning, modelsLoaded, knownFaces, onAccessDecision, videoRef]);

  // Handle scanning state changes
  useEffect(() => {
    if (isScanning) {
      lastFaceDetectedTimeRef.current = Date.now();
    } else {
      setDetectedFaces([]);
    }
  }, [isScanning]);

  return {
    isScanning,
    setIsScanning,
    detectedFaces,
  };
};
