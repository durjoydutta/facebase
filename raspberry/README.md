# FaceBase Raspberry Pi Bridge

This folder contains the optional Raspberry Pi webhook server that receives
access-control decisions from the FaceBase Next.js backend and toggles GPIO
pins to unlock/lock a physical actuator.

## Quick start

```bash
cd raspberry
python -m venv .venv
source .venv/bin/activate  # On Windows use `.venv\Scripts\activate`
pip install -r requirements.txt

# Optional: adjust `.env.local` to match your hardware defaults
python facebase_pi_server.py
```

The server exposes a `POST /webhook` endpoint. Point
`RASPBERRY_PI_WEBHOOK_URL` in the Next.js app to this URL
(e.g. `http://pi.local:8080/webhook`).

## Environment variables

| Variable                  | Description                                                                                                     | Default |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | ------- |
| `FACEBASE_RELAY_PIN`      | BCM pin connected to relay/solenoid controller                                                                  | `17`    |
| `FACEBASE_UNLOCK_SECONDS` | Duration to hold the relay active when access is granted                                                        | `3`     |
| `FACEBASE_SHARED_SECRET`  | Optional bearer token required on incoming requests; must match `RASPBERRY_PI_SHARED_SECRET` in the Next.js app | –       |
| `FACEBASE_PORT`           | Port the Flask server listens on                                                                                | `8080`  |

The script automatically loads the `.env.local` file in this directory, so
editing that file is the simplest way to update relay pins, unlock durations,
or secrets without exporting environment variables for every run.

## Hardware integration

The script uses `gpiozero.OutputDevice` to drive a relay. When running the
script on a non-Pi environment, it falls back to logging to stdout so you can
develop the integration without connected hardware.
