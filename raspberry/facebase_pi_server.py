"""Simple webhook server to bridge FaceBase with Raspberry Pi hardware.

Run with:
  export FACEBASE_RELAY_PIN=17
  export FACEBASE_SHARED_SECRET=supersecret
  python facebase_pi_server.py

This script expects the Next.js app to POST an access decision to the
configured endpoint. When an accepted decision arrives, the relays toggles a
solenoid or other actuator to unlock the door for a short duration.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict

from flask import Flask, jsonify, request

try:
    from gpiozero import OutputDevice
except ImportError:  # Running off-device, use a no-op stub.
    class OutputDevice:  # type: ignore
        def __init__(self, pin: int, active_high: bool = False, initial_value: bool = True):
            self.pin = pin
            self.state = initial_value

        def on(self) -> None:
            self.state = True
            print(f"[facebase] relay {self.pin} -> ON")

        def off(self) -> None:
            self.state = False
            print(f"[facebase] relay {self.pin} -> OFF")

        def close(self) -> None:
            print(f"[facebase] relay {self.pin} -> CLOSE")

def load_env_file(filename: str = ".env.local") -> None:
    env_path = Path(__file__).with_name(filename)
    if not env_path.exists():
        return

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        cleaned = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, cleaned)


load_env_file()

RELAY_PIN = int(os.getenv("FACEBASE_RELAY_PIN", "17"))
UNLOCK_DURATION_SECONDS = float(os.getenv("FACEBASE_UNLOCK_SECONDS", "3"))
SHARED_SECRET = os.getenv("FACEBASE_SHARED_SECRET")

app = Flask(__name__)
relay = OutputDevice(RELAY_PIN, active_high=False, initial_value=True)


def unlock() -> None:
    relay.off()
    time.sleep(UNLOCK_DURATION_SECONDS)
    relay.on()


def verify_secret() -> bool:
    if not SHARED_SECRET:
        return True
    header = request.headers.get("Authorization", "")
    return header == f"Bearer {SHARED_SECRET}"


@app.post("/webhook")
def handle_webhook():
    if not verify_secret():
        return jsonify({"error": "unauthorized"}), 401

    try:
        payload: Dict[str, Any] = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "invalid json"}), 400

    status = payload.get("status")
    banned = bool(payload.get("banned"))

    if status not in {"accepted", "rejected"}:
        return jsonify({"error": "invalid status"}), 400

    if status == "accepted" and not banned:
        unlock()
        result = "unlocked"
    else:
        result = "denied"

    print("[facebase] decision", json.dumps(payload))

    return jsonify({"result": result})


if __name__ == "__main__":
    port = int(os.getenv("FACEBASE_PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
