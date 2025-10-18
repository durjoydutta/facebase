import type { VisitStatus } from "@/lib/database.types";

interface AccessDecision {
  status: VisitStatus;
  matchedUserId?: string | null;
  matchedUserName?: string | null;
  matchedUserEmail?: string | null;
  snapshotUrl?: string | null;
  distance?: number | null;
  banned?: boolean;
}

interface AccessControlResult {
  ok: boolean;
  error?: string;
  status?: number;
}

const resolveWebhookUrl = () =>
  process.env.RASPBERRY_PI_WEBHOOK_URL ??
  (process.env.NODE_ENV !== "production"
    ? "http://localhost:8080/webhook"
    : undefined);

const resolveSharedSecret = () => process.env.RASPBERRY_PI_SHARED_SECRET;

const buildPayload = (decision: AccessDecision) => ({
  status: decision.status,
  matchedUserId: decision.matchedUserId ?? null,
  matchedUserName: decision.matchedUserName ?? null,
  matchedUserEmail: decision.matchedUserEmail ?? null,
  snapshotUrl: decision.snapshotUrl ?? null,
  distance: decision.distance ?? null,
  banned: decision.banned ?? false,
  timestamp: new Date().toISOString(),
});

export const AccessControlService = {
  isConfigured(): boolean {
    return Boolean(resolveWebhookUrl());
  },

  async notify(decision: AccessDecision): Promise<AccessControlResult> {
    const webhookUrl = resolveWebhookUrl();

    if (!webhookUrl) {
      return { ok: false, error: "Webhook URL not configured." };
    }

    const sharedSecret = resolveSharedSecret();

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sharedSecret ? { Authorization: `Bearer ${sharedSecret}` } : {}),
        },
        body: JSON.stringify(buildPayload(decision)),
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `Webhook responded with ${response.status}`,
        };
      }

      return { ok: true, status: response.status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  },
};
