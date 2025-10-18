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

| Variable                    | Description                                                                                                     | Default |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- | ------- |
| `FACEBASE_RELAY_PIN`        | BCM pin connected to relay/solenoid controller                                                                  | `17`    |
| `FACEBASE_UNLOCK_SECONDS`   | Duration to hold the relay active when access is granted                                                        | `3`     |
| `FACEBASE_SHARED_SECRET`    | Optional bearer token required on incoming requests; must match `RASPBERRY_PI_SHARED_SECRET` in the Next.js app | –       |
| `FACEBASE_PORT`             | Port the Flask server listens on                                                                                | `8080`  |
| `FACEBASE_BUZZER_PIN`       | Optional passive buzzer pin used for audible feedback                                                           | –       |
| `FACEBASE_COOLDOWN_SECONDS` | Minimum delay between successive unlock attempts                                                                | `1`     |

The script automatically loads the `.env.local` file in this directory, so
editing that file is the simplest way to update relay pins, unlock durations,
or secrets without exporting environment variables for every run.

## Hardware integration

The script uses `gpiozero.OutputDevice` to drive a relay. When running the
script on a non-Pi environment, it falls back to logging to stdout so you can
develop the integration without connected hardware.

If you wire a GPIO buzzer to the pi, set `FACEBASE_BUZZER_PIN` in `.env.local`.
Accepted events emit three quick beeps; rejected or banned events emit a
single longer tone so visitors receive immediate feedback. When an accepted
scan arrives inside the cooldown window, the buzzer plays two medium beeps and
the server responds with `{"result":"cooldown"}` so the visitor knows to try
again after the specified interval.

## Event flow overview

- **Accepted (not banned, outside cooldown)**: Relay drops for `FACEBASE_UNLOCK_SECONDS`, buzzer beeps three times, JSON reply `{ "result": "unlocked" }`.
- **Accepted during cooldown**: Relay stays locked, buzzer plays the cooldown pattern, JSON reply `{ "result": "cooldown", "retry_after": <seconds> }`.
- **Rejected / face not recognized**: Relay remains locked, buzzer plays a sustained tone, response `{ "result": "denied", "banned": false }`.
- **Accepted but flagged banned**: Treated as denial; no unlock, rejection tone, response `{ "result": "denied", "banned": true }`.
