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
| **Servo** | **GPIO 18** | Controls the locking mechanism. **Must be a Hardware PWM pin.** |
| **PIR** | GPIO 4 | Detects motion. |
| **Buzzer** | GPIO 27 | Active buzzer for audio feedback. |

> [!IMPORTANT]
> **Servo Pin Change**: The servo must be connected to **GPIO 18** (Physical Pin 12) to use hardware PWM. Do not use GPIO 17.

## Prerequisites

### 1. System Configuration (Enable PWM)
To prevent servo jitter, this project uses hardware PWM. You must enable the PWM overlay.

1.  Edit `/boot/config.txt`:
    ```bash
    sudo nano /boot/config.txt
    ```
2.  Add or uncomment the following line:
    ```text
    dtoverlay=pwm-2chan
    ```
3.  Reboot the Pi:
    ```bash
    sudo reboot
    ```

### 2. System Packages
Install basic Python development tools:

```bash
sudo apt-get update
sudo apt-get install python3-venv python3-dev
```

### 3. Environment Variables
The script automatically loads environment variables from the **project root** `.env.local` file (`../.env.local`). Ensure this file exists in the parent directory with the following variables:

```env
# MQTT Configuration
MQTT_BROKER_URL=broker.hivemq.com
MQTT_PORT=8883
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password

# Hardware Configuration (Optional overrides)
# FACEBASE_SERVO_PIN is now determined by channel index for HardwarePWM. 
# Channel 0 usually maps to GPIO 18.
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

You need to run the client with `sudo` because accessing hardware PWM requires root privileges.

**From the `raspberry` directory:**
```bash
sudo .venv/bin/python mqtt_client.py
```

## Audio Feedback

The system provides distinct audio feedback via the buzzer:

- **Access Granted**: 3 short beeps (Success)
- **Access Denied (Unknown)**: 1 long beep (Warning)
- **Access Denied (Banned)**: 5 fast beeps (Urgent Alert)
- **Cooldown Active**: 2 medium beeps

## Auto-Start on Boot

To configure the MQTT client to start automatically when the Raspberry Pi boots, use the provided `setup_service.sh` script.

1.  **Make the script executable:**
    ```bash
    chmod +x setup_service.sh
    ```

2.  **Run the setup script:**
    ```bash
    ./setup_service.sh
    ```
    This script will:
    - Create a systemd service file `/etc/systemd/system/facebase_mqtt.service`.
    - Configure the service to run as `root` (required for hardware PWM control).
    - Use the Python interpreter from the `.venv` virtual environment.
    - Enable and start the service immediately.

3.  **Check the status:**
    ```bash
    sudo systemctl status facebase_mqtt.service
    ```

4.  **View logs:**
    To see the output of the running service:
    ```bash
    sudo journalctl -u facebase_mqtt.service -f
    ```

## Troubleshooting

-   **Servo Jitter**:
    Ensure you are using **GPIO 18** and have enabled `dtoverlay=pwm-2chan` in `/boot/config.txt`.
-   **Permission denied**:
    Run the script with `sudo`.
-   **Buzzer not working**:
    Check if you have an active or passive buzzer. This script assumes an active buzzer (on/off).
