# FaceBase Raspberry Pi Client (MQTT)

This folder contains the Python client for the FaceBase access control system. It uses MQTT to communicate with the Next.js admin console.

## Features
- **Motion Detection**: Uses a PIR sensor to detect visitors and publishes `facebase/motion` events.
- **Access Control**: Subscribes to `facebase/access` to unlock the door (relay) and provide audio feedback (buzzer).
- **Real-time**: Event-driven architecture for low latency.

## Hardware Setup
- **Relay**: Connected to GPIO 17 (default).
- **PIR Sensor**: Connected to GPIO 4 (default).
- **Buzzer**: Connected to GPIO 27 (default).

## Quick Start

1. **Install Dependencies**:
   ```bash
   cd raspberry
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Configuration**:
   Create a `.env.local` file in this directory:
   ```env
   MQTT_BROKER_URL=broker.hivemq.com
   MQTT_PORT=8883
   MQTT_USERNAME=your_username
   MQTT_PASSWORD=your_password
   
   FACEBASE_RELAY_PIN=17
   FACEBASE_PIR_PIN=4
   FACEBASE_BUZZER_PIN=27
   FACEBASE_UNLOCK_SECONDS=3
   ```

3. **Run the Client**:
   ```bash
   python mqtt_client.py
   ```

## MQTT Topics
- **Publish**: `facebase/motion` - Payload: `{"event": "motion_detected"}`
- **Subscribe**: `facebase/access` - Payload: `{"result": "unlocked" | "denied", "banned": boolean}`
