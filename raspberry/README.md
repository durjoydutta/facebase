# FaceBase Raspberry Pi Client (MQTT)

This folder contains the Python client for the FaceBase access control system. It uses MQTT to communicate with the Next.js admin console and controls hardware components via GPIO.

## Features
- **Motion Detection**: Uses a PIR sensor to detect visitors and publishes `facebase/motion` events.
- **Access Control**: Subscribes to `facebase/access` to unlock the door (Servo) and provide audio feedback (Buzzer).
- **Real-time**: Event-driven architecture for low latency.

## Hardware Setup
- **Servo Motor**: Connected to GPIO 17 (default). Controls the locking mechanism.
- **PIR Sensor**: Connected to GPIO 4 (default). Detects motion.
- **Buzzer**: Connected to GPIO 27 (default). Provides audio feedback (beeps).

**Note:** The servo requires the `pigpio` daemon to be running for precise timing.

## Quick Start

### 1. System Requirements
This client requires `pigpio` for servo control. Install it on your Raspberry Pi:

```bash
sudo apt-get update
sudo apt-get install pigpio python3-venv
```

**Enable and start the daemon:**
```bash
sudo systemctl enable pigpiod
sudo systemctl start pigpiod
```

### 2. Install Dependencies

```bash
cd raspberry
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configuration
Create a `.env.local` file in this directory (or use the one in the root if symlinked):

```env
# MQTT Configuration
MQTT_BROKER_URL=broker.hivemq.com
MQTT_PORT=8883
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password

# Hardware Pinout (BCM)
FACEBASE_SERVO_PIN=17
FACEBASE_PIR_PIN=4
FACEBASE_BUZZER_PIN=27
FACEBASE_UNLOCK_SECONDS=3
```

### 4. Run the Client

```bash
python mqtt_client.py
```

## MQTT Topics
- **Publish**: `facebase/motion` - Payload: `{"event": "motion_detected"}`
- **Subscribe**: `facebase/access` - Payload: `{"result": "unlocked" | "denied", "banned": boolean}`
