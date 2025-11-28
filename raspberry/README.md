# FaceBase Raspberry Pi Client

This folder contains the Python client for the FaceBase access control system. It runs on a Raspberry Pi, communicating with the Next.js admin console via MQTT and controlling hardware components (Servo, PIR, Buzzer) via GPIO.

## Features
- **Motion Detection**: Uses a PIR sensor to detect visitors and publishes `facebase/motion` events to the cloud.
- **Access Control**: Subscribes to `facebase/access` to receive unlock commands (`allowed`/`denied`).
- **Hardware Control**:
  - **Servo**: Unlocks the door when access is granted.
  - **Buzzer**: Provides audio feedback for access granted, denied, or cooldown states.
- **Robustness**: Auto-reconnects to MQTT and handles sensor cooldowns.

## Hardware Setup (GPIO BCM)
| Component | Default Pin | Description |
|-----------|-------------|-------------|
| **Servo** | GPIO 17 | Controls the locking mechanism. |
| **PIR** | GPIO 4 | Detects motion. |
| **Buzzer** | GPIO 27 | Active buzzer for audio feedback. |

## Prerequisites

### 1. System Packages
The client requires basic Python development tools.

```bash
sudo apt-get update
sudo apt-get install python3-venv python3-dev
```

### 2. Environment Variables
The script automatically loads environment variables from the **project root** `.env.local` file (`../.env.local`). Ensure this file exists in the parent directory with the following variables:

```env
# MQTT Configuration
MQTT_BROKER_URL=broker.hivemq.com
MQTT_PORT=8883
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password

# Hardware Configuration (Optional overrides)
FACEBASE_SERVO_PIN=17
FACEBASE_PIR_PIN=4
FACEBASE_BUZZER_PIN=27
FACEBASE_UNLOCK_SECONDS=3
```

## Installation

1.  **Navigate to the folder:**
    ```bash
    cd raspberry
    ```

2.  **Create a virtual environment:**
    ```bash
    python3 -m venv .venv
    ```

3.  **Install dependencies:**
    ```bash
    .venv/bin/pip install -r requirements.txt
    ```

## Running the Client

You can run the client using the python executable in the virtual environment.

**From the `raspberry` directory:**
```bash
.venv/bin/python mqtt_client.py
```

**One-liner (copy-paste friendly):**
```bash
cd raspberry && .venv/bin/python mqtt_client.py
```

## Audio Feedback

The system provides distinct audio feedback via the buzzer:

- **Access Granted**: 3 short beeps (Success)
- **Access Denied (Unknown)**: 1 long beep (Warning)
- **Access Denied (Banned)**: 5 fast beeps (Urgent Alert)
- **Cooldown Active**: 2 medium beeps

## Troubleshooting

-   **Servo Jitter**:
    Without `pigpio`, the servo uses software PWM which might jitter. If this becomes an issue, we can switch back to the `pigpio` implementation.
-   **Permission denied**:
    Ensure your user has permission to access GPIO (usually the `gpio` group).
-   **Buzzer not working**:
    Check if you have an active or passive buzzer. This script assumes an active buzzer (on/off).
