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
     from gpiozero import Buzzer, OutputDevice
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

    class Buzzer:  # type: ignore
        def __init__(self, pin: int):
            self.pin = pin

        def beep(
            self,
            on_time: float,
            off_time: float,
            n: int | None = None,
            background: bool = True,
        ) -> None:
            cycle = n if n is not None else -1
            print(
                "[facebase] buzzer %s -> beep on=%s off=%s cycles=%s background=%s"
                % (self.pin, on_time, off_time, cycle, background)
            )

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
BUZZER_PIN = os.getenv("FACEBASE_BUZZER_PIN")
COOLDOWN_SECONDS = float(os.getenv("FACEBASE_COOLDOWN_SECONDS", "1"))

app = Flask(__name__)
relay = OutputDevice(RELAY_PIN, active_high=False, initial_value=True)
buzzer = Buzzer(int(BUZZER_PIN)) if BUZZER_PIN else None
last_action_at = time.monotonic() - COOLDOWN_SECONDS


def unlock() -> None:
    relay.off()
    time.sleep(UNLOCK_DURATION_SECONDS)
    relay.on()


def signal_accept() -> None:
    if not buzzer:
        return
    buzzer.beep(on_time=0.1, off_time=0.1, n=3, background=False)


def signal_reject() -> None:
    if not buzzer:
        return
    buzzer.beep(on_time=0.4, off_time=0.2, n=1, background=False)


def signal_cooldown() -> None:
    if not buzzer:
        return
    buzzer.beep(on_time=0.2, off_time=0.1, n=2, background=False)


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

    global last_action_at

    now = time.monotonic()
    cooldown_active = COOLDOWN_SECONDS > 0 and now - last_action_at < COOLDOWN_SECONDS

    if status == "accepted" and not banned:
        if cooldown_active:
            signal_cooldown()
            retry_after = max(0.0, COOLDOWN_SECONDS - (now - last_action_at))
            print(f"[facebase] cooldown active, retry after {retry_after:.2f}s")
            result = "cooldown"
            details = {"cooldown": True, "retry_after": round(retry_after, 3)}
        else:
            unlock()
            signal_accept()
            last_action_at = now
            result = "unlocked"
            details = {"cooldown": False}
    else:
        signal_reject()
        result = "denied"
        details = {"banned": banned}

    print("[facebase] decision", json.dumps(payload))

    return jsonify({"result": result, **details})


if __name__ == "__main__":
    port = int(os.getenv("FACEBASE_PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
