# FaceBase Architecture & Workflow Documentation

## 1. Project Overview

**FaceBase** is a modern, browser-based facial recognition access control system that seamlessly integrates web technologies with IoT hardware. It provides a secure, real-time solution for managing physical access using facial biometrics.

### **Problem Solved**
Traditional access control systems are often expensive, proprietary, and difficult to manage remotely. FaceBase solves this by using standard web technologies (Next.js) and commodity hardware (Raspberry Pi) to create a flexible, cost-effective, and user-friendly access control solution.

### **Target Use Cases**
*   **Office Entry**: Secure access for employees.
*   **Smart Home**: Keyless entry for residents.
*   **Restricted Areas**: Monitoring and controlling access to server rooms or storage.

### **Key Features**
*   **Real-time Recognition**: Fast and accurate face detection and recognition directly in the browser.
*   **Remote Management**: Full admin console for managing users, viewing logs, and monitoring status.
*   **Hardware Integration**: Direct control of physical locks (servos) and sensors (PIR, Buzzer) via MQTT.
*   **Smart Cooldowns**: Intelligent logic to prevent spamming and ensure smooth operation.
*   **Secure Logging**: Comprehensive history of all access attempts, including snapshots.

---

## 2. High-Level System Architecture

The system follows a distributed architecture where the heavy lifting of facial recognition happens in the client's browser, while the hardware control is managed by a lightweight Python script on a Raspberry Pi. Communication is bridged via a secure MQTT broker and Supabase handles data persistence.

### **System Diagram**

![FaceBase System Architecture](public/images/facebase_architecture.png)

```mermaid
graph TD
    subgraph "Client Side (Browser)"
        UI[Next.js UI / Dashboard]
        Engine[Face Recognition Engine (face-api.js)]
        UI --> Engine
    end

    subgraph "Cloud / Backend"
        Supabase[(Supabase)]
        MQTT[MQTT Broker (HiveMQ/Mosquitto)]
        
        Supabase -- Auth/DB/Storage --> UI
        UI -- Publish Access Decisions --> MQTT
        MQTT -- Forward Commands --> Pi
    end

    subgraph "Hardware Node (Raspberry Pi)"
        Pi[Raspberry Pi Controller]
        Sensors[PIR Motion Sensor]
        Actuators[Servo Lock / Buzzer]
        
        Sensors -- Motion Event --> Pi
        Pi -- Publish Motion --> MQTT
        MQTT -- Notify Motion --> UI
        Pi -- Control --> Actuators
    end
```

### **Deployment Strategy**
*   **Frontend**: Next.js application hosted on **Vercel** (or similar), serving the UI and running the recognition engine.
*   **Backend**: **Supabase** provides Authentication, PostgreSQL Database, File Storage for face samples, and Realtime subscriptions.
*   **Messaging**: **HiveMQ** (or Mosquitto) acts as the MQTT broker. The browser connects via **WebSockets (WSS)**, while the Pi connects via **MQTTS (TLS)**.
*   **Hardware**: A **Raspberry Pi** runs a Python script (`mqtt_client.py`) to interface with GPIO pins for the lock, buzzer, and motion sensor.

---

## 3. Full Workflow Explanation

The system operates in a continuous loop, triggered by motion or manual interaction.

1.  **Motion Detection**: The PIR sensor on the Pi detects movement.
2.  **Wake Up**: The Pi publishes a `facebase/motion` event to the MQTT broker.
3.  **Client Activation**: The Next.js client (running on a tablet/kiosk) receives the motion event and wakes up the recognition view (if sleeping).
4.  **Recognition**: The browser captures video frames, detects faces, and compares them against known embeddings.
5.  **Decision Making**:
    *   **Match Found**: If a face matches a known user with high confidence.
    *   **Access Check**: The system checks if the user is banned or on cooldown.
    *   **Unknown**: If the face is unknown, it logs the attempt (subject to cooldowns).
6.  **Command Execution**: The browser publishes a `facebase/access` command (`unlock` or `deny`) to MQTT.
7.  **Hardware Action**:
    *   **Unlock**: Pi receives `unlock`, rotates the servo to open the door, and beeps the buzzer (3 short beeps).
    *   **Deny**: Pi receives `deny`, keeps the door locked, and emits a warning beep (1 long beep).
8.  **Logging**: The event (timestamp, user, snapshot, status) is logged to Supabase for history tracking.

---

## 4. Recognition Pipeline

The recognition engine (`use-face-recognition-engine.ts`) is the core intelligence of FaceBase.

1.  **Frame Acquisition**: Captures video stream from the webcam.
2.  **Face Detection**: Uses `face-api.js` (TinyFaceDetector) to locate faces in the frame.
3.  **Embedding Extraction**: Converts facial features into a 128-dimensional float array (descriptor).
4.  **Matching**: Calculates the Euclidean distance between the detected descriptor and known face descriptors.
    *   **Threshold**: A distance `< 0.45` is considered a match.
5.  **Multi-Frame Voting (Persistence)**:
    *   A decision is not made instantly. The system waits for **5 consecutive frames** (`MIN_PERSISTENCE_FRAMES`) of consistent results to prevent flickering or false positives.
6.  **Access Rules**:
    *   **All Known**: If all detected faces are known and allowed -> **GRANT ACCESS**.
    *   **Mixed Group**: If known and unknown faces are present -> **DENY ACCESS** (Security Rule).
    *   **Banned in Group**: If *any* banned user is detected (even with allowed users) -> **DENY ACCESS** (Strict Security).
    *   **Unknown**: If only unknown faces are present -> **DENY ACCESS**.

---

## 5. Smart Cooldown System

To prevent log spam and hardware wear, the system implements a robust cooldown mechanism.

| Cooldown Type | Duration | Description |
| :--- | :--- | :--- |
| **Accepted Cooldown** | **15 Seconds** | Prevents the door from unlocking repeatedly for the same person immediately after entry. |
| **Unknown Cooldown** | **6 Seconds** | Prevents flooding the logs with "Unknown User" entries for the same stranger standing at the door. |
| **Disappear Reset** | **4 Seconds** | Resets the internal state if no faces are seen for this duration, preparing for a fresh interaction. |
| **Auto-Pause** | **5 Minutes** | Stops processing video to save resources if no faces are detected for a long period. |

---

## 6. Hardware Integration

The Raspberry Pi acts as the physical interface.

### **Components**
*   **Controller**: Raspberry Pi (3/4/Zero W)
*   **Lock**: SG90 Micro Servo (or compatible high-torque servo)
*   **Sensor**: HC-SR501 PIR Motion Sensor
*   **Feedback**: Active Piezo Buzzer

### **Wiring & Config**

| Component | GPIO Pin (BCM) | Config Key | Notes |
| :--- | :--- | :--- | :--- |
| **Servo** | GPIO 17 | `FACEBASE_SERVO_PIN` | Requires PWM. External 5V power recommended. |
| **PIR Sensor** | GPIO 4 | `FACEBASE_PIR_PIN` | 3.3V logic. |
| **Buzzer** | GPIO 27 | `FACEBASE_BUZZER_PIN` | Active HIGH. |

### **Servo Logic**
*   **Locked Position**: 12 degrees
*   **Unlocked Position**: 97 degrees
*   **Unlock Duration**: 3 seconds (configurable via `FACEBASE_UNLOCK_SECONDS`)

### **MQTT Topics**
*   `facebase/motion`: Published by Pi when motion is detected.
*   `facebase/access`: Subscribed by Pi to receive `unlock`/`deny` commands.
*   `facebase/status`: (Optional) Heartbeat/status updates.

---

## 7. UI & Admin Console Structure

The UI is built with Next.js and Tailwind CSS, focusing on a "Dark Mode" aesthetic.

### **Dashboard**
*   **Stats Overview**: Total users, 24h access grants/denials, total face samples.
*   **User Lists**: Separated into "Administrators" and "Members".
*   **Search**: Real-time filtering of users.
*   **Sync Status**: Indicators for data freshness and manual sync option.

### **User Management**
*   **Profile Page**: Detailed view of a user's activity.
*   **History**: Paginated list of access attempts with snapshots.
*   **Face Samples**: Gallery of registered face embeddings.
*   **Actions**: Ban/Unban users, Delete history, Edit details.

### **Registration**
*   **Enrollment**: Capture 3 face samples via webcam.
*   **Validation**: Ensures face is clearly visible before capturing.

---

## 8. Codebase Layout

```text
src/
├── app/
│   ├── (auth)/             # Login/Auth pages
│   ├── (console)/          # Admin Dashboard & Protected routes
│   │   ├── dashboard/      # Main stats view
│   │   ├── users/          # User management
│   │   └── register/       # New user enrollment
│   ├── api/                # Next.js API Routes (Cron, Data fetching)
│   └── globals.css         # Global styles & Tailwind
├── components/             # Reusable UI components
├── hooks/                  # Custom React hooks (useFaceRecognitionEngine)
├── lib/                    # Utilities, Supabase client, MQTT helper
└── raspberry/              # Python hardware control scripts
```

---

## 9. Environment & Config

The system requires specific environment variables to function.

### **Browser (.env.local)**
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# MQTT Configuration (WebSockets)
NEXT_PUBLIC_MQTT_BROKER_URL=wss://broker.hivemq.com:8884/mqtt
NEXT_PUBLIC_MQTT_USERNAME=your-mqtt-user
NEXT_PUBLIC_MQTT_PASSWORD=your-mqtt-pass
MQTT_TOPIC_ACCESS=facebase/access
```

### **Raspberry Pi (.env)**
```bash
# MQTT Configuration (TCP/TLS)
MQTT_BROKER_URL=broker.hivemq.com
MQTT_PORT=8883
MQTT_USERNAME=your-mqtt-user
MQTT_PASSWORD=your-mqtt-pass

# Hardware Pinout
FACEBASE_SERVO_PIN=17
FACEBASE_PIR_PIN=4
FACEBASE_BUZZER_PIN=27
FACEBASE_UNLOCK_SECONDS=3
```

---

## 10. Future Roadmap

*   **Improved Analytics**: Charts and graphs for peak access times.
*   **Remote Unlock Override**: Button in dashboard to manually trigger unlock.
*   **Liveness Detection**: Anti-spoofing measures (blink detection, depth check).
*   **Camera Calibration**: Tools to adjust camera settings (brightness, contrast) for better recognition.
