"use client";

import Image from "next/image";

import type { CapturedSample } from "./WebcamCapture";

interface FaceCardProps {
  sample: CapturedSample;
  index: number;
  onRemove?: (id: string) => void;
}

const FaceCard = ({ sample, index, onRemove }: FaceCardProps) => (
  <div className="flex items-center gap-4 rounded-xl border border-border bg-card/60 p-4 shadow-sm">
    <Image
      src={sample.imageDataUrl}
      alt={`Face sample ${index + 1}`}
      width={80}
      height={80}
      className="h-20 w-20 rounded-lg object-cover"
    />
    <div className="flex-1">
      <p className="text-sm font-semibold">Sample {index + 1}</p>
      <p className="text-xs text-muted-foreground">
        {new Date(sample.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
    {onRemove ? (
      <button
        type="button"
        onClick={() => onRemove(sample.id)}
        className="rounded-full border border-border px-3 py-1 text-xs font-medium transition hover:bg-muted/70">
        Remove
      </button>
    ) : null}
  </div>
);

export default FaceCard;
