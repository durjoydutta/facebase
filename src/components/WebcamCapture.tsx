"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";

export interface CapturedSample {
  id: string;
  embedding: number[];
  imageDataUrl: string;
  createdAt: number;
}

interface WebcamCaptureProps {
  onCapture: (sample: CapturedSample) => void;
  onError: (message: string) => void;
  modelsLoaded: boolean;
  disabled?: boolean;
}

const detectionOptions = new faceapi.TinyFaceDetectorOptions();

const WebcamCapture = ({
  onCapture,
  onError,
  modelsLoaded,
  disabled = false,
}: WebcamCaptureProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

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
        onError(
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
  }, [onError]);

  const capture = useCallback(async () => {
    if (!modelsLoaded) {
      onError("Face models are still loading. Please wait a moment.");
      return;
    }

    if (disabled) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      onError("Webcam feed is not ready yet.");
      return;
    }

    if (video.readyState < 2) {
      onError("Webcam feed is initializing. Try again in a second.");
      return;
    }

    setIsCapturing(true);

    try {
      const detection = await faceapi
        .detectSingleFace(video, detectionOptions)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        onError("No face detected. Center your face and try again.");
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        onError("Snapshot canvas is not ready.");
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");

      if (!context) {
        onError("Unable to capture snapshot context.");
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageDataUrl = canvas.toDataURL("image/png");

      const sample: CapturedSample = {
        id: crypto.randomUUID(),
        embedding: Array.from(detection.descriptor),
        imageDataUrl,
        createdAt: Date.now(),
      };

      onCapture(sample);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Unable to process snapshot. Please try again."
      );
    } finally {
      setIsCapturing(false);
    }
  }, [disabled, modelsLoaded, onCapture, onError]);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-muted/40">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-[260px] w-full bg-black object-cover"
        />
      </div>
      <button
        type="button"
        onClick={() => void capture()}
        disabled={!modelsLoaded || disabled || isCapturing}
        className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">
        {isCapturing ? "Capturing..." : "Capture sample"}
      </button>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default WebcamCapture;
