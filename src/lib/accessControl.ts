import mqtt from "mqtt";
import { VisitStatus } from "@/lib/database.types";

const MQTT_BROKER = process.env.NEXT_PUBLIC_MQTT_BROKER_URL || "wss://broker.hivemq.com:8884/mqtt";
const MQTT_USERNAME = process.env.NEXT_PUBLIC_MQTT_USERNAME;
const MQTT_PASSWORD = process.env.NEXT_PUBLIC_MQTT_PASSWORD;
const MQTT_TOPIC_ACCESS = process.env.MQTT_TOPIC_ACCESS || "facebase/access";

interface NotifyPayload {
  status?: VisitStatus;
  matchedUserId?: string | null;
  matchedUserName?: string | null;
  matchedUserEmail?: string | null;
  snapshotUrl?: string | null;
  distance?: number | null;
  banned?: boolean;
}

export const AccessControlService = {
  notify: async (payload: NotifyPayload) => {
    return new Promise<{ ok: boolean; error?: string; status?: number }>((resolve) => {
      console.log("Connecting to MQTT broker for Access Control:", MQTT_BROKER);
      
      const client = mqtt.connect(MQTT_BROKER, {
        username: MQTT_USERNAME,
        password: MQTT_PASSWORD,
        connectTimeout: 5000,
      });

      client.on("connect", () => {
        console.log("AccessControlService: MQTT Connected");
        let result = "denied";
        if (payload.status === "accepted") {
          result = "allowed";
        }

        const message = {
          result: result,
          ...payload,
        };

        client.publish(MQTT_TOPIC_ACCESS, JSON.stringify(message), { qos: 1 }, (err) => {
          client.end();
          if (err) {
            console.error("AccessControlService: MQTT publish error:", err);
            resolve({ ok: false, error: "Failed to publish MQTT message" });
          } else {
            console.log("AccessControlService: Message published to", MQTT_TOPIC_ACCESS);
            resolve({ ok: true });
          }
        });
      });

      client.on("error", (err) => {
        console.error("AccessControlService: MQTT connection error:", err);
        client.end();
        resolve({ ok: false, error: "MQTT connection failed" });
      });
      
      // Handle timeout or other issues
      setTimeout(() => {
        if (client.connected) return;
        console.error("AccessControlService: MQTT connection timeout");
        client.end();
        resolve({ ok: false, error: "MQTT connection timeout" });
      }, 6000);
    });
  },

  isConfigured: () => {
    return !!process.env.NEXT_PUBLIC_MQTT_BROKER_URL;
  },
};
