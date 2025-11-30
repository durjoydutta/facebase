# FaceBase MQTT Protocol

This document outlines the MQTT communication protocol used between the FaceBase Next.js Admin Console (Publisher/Subscriber) and the Raspberry Pi Client (Subscriber/Publisher).

## Architecture Overview

The system uses a central MQTT broker (HiveMQ Cloud) to facilitate real-time communication.

-   **Next.js App**: Acts as the "Brain". It processes video feeds, performs face recognition, and sends access commands. It also listens for motion events to wake up the recognition system.
-   **Raspberry Pi**: Acts as the "Body". It detects motion via PIR sensor and controls the physical door lock (Servo) and buzzer based on commands received.

## Topics & Messages

### 1. Motion Detection
**Topic:** `facebase/motion`
**Direction:** Raspberry Pi -> Next.js App

Published by the Raspberry Pi when the PIR sensor detects movement. This triggers the Next.js app to "wake up" or notify the admin that someone is at the door.

**Payload:**
```json
{
  "event": "motion_detected"
}
```

### 2. Access Control
**Topic:** `facebase/access`
**Direction:** Next.js App -> Raspberry Pi

Published by the Next.js app after processing a face. It tells the Raspberry Pi whether to unlock the door or deny access.

**Payloads:**

*   **Unlock (Access Granted):**
    ```json
    {
      "result": "allowed",
      "banned": false,
      "user": "John Doe, Jane Smith"
    }
    ```
    *Action:* Pi unlocks the servo, beeps 3 times (success tone).

*   **Access Denied (Unknown Face):**
    ```json
    {
      "result": "denied",
      "banned": false,
      "user": "Unknown"
    }
    ```
    *Action:* Pi keeps door locked, beeps 1 long time (error tone).

*   **Banned User (Access Denied):**
    ```json
    {
      "result": "denied",
      "banned": true,
      "user": "Jane Doe"
    }
    ```
    *Action:* Pi keeps door locked, beeps 1 long time (error tone). *Note: If a banned user is detected in a group, the `user` field will list all recognized users (e.g., "John Doe, Banned User (Banned)").*

*   **Cooldown (Optional/Future):**
    ```json
    {
      "result": "cooldown"
    }
    ```
    *Action:* Pi beeps 2 medium times (warning tone).

## Workflow

1.  **Idle State**: Next.js app is idle or in background. Pi is monitoring PIR sensor.
2.  **Motion Event**: Visitor approaches -> PIR triggers -> Pi publishes to `facebase/motion`.
3.  **Wake Up**: Next.js app receives motion event -> UI updates to "Motion detected! Resuming..." -> Face recognition engine starts scanning.
4.  **Recognition**:
    *   **Match Found**: App identifies user -> Checks permissions -> Publishes `{"result": "unlocked"}` to `facebase/access`.
    *   **No Match**: App fails to identify -> Publishes `{"result": "denied"}` to `facebase/access`.
5.  **Action**: Pi receives message -> Activates Servo/Buzzer accordingly.

## Configuration

The MQTT connection details are shared across both the Next.js app and the Python script via environment variables.

| Variable | Description |
| :--- | :--- |
| `MQTT_BROKER_URL` | The URL of the HiveMQ broker (e.g., `broker.hivemq.com`). |
| `MQTT_PORT` | Port number (usually `8883` for TLS). |
| `MQTT_USERNAME` | Username for broker authentication. |
| `MQTT_PASSWORD` | Password for broker authentication. |
