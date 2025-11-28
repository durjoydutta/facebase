import os
import time
import json
import threading
import paho.mqtt.client as mqtt
from gpiozero import MotionSensor, Buzzer, AngularServo

from dotenv import load_dotenv

# Load environment variables
load_dotenv('../.env.local')

# Configuration
MQTT_BROKER = os.getenv('MQTT_BROKER_URL', 'broker.hivemq.com')
MQTT_PORT = int(os.getenv('MQTT_PORT', 1883))
MQTT_USERNAME = os.getenv('MQTT_USERNAME', '')
MQTT_PASSWORD = os.getenv('MQTT_PASSWORD', '')
MQTT_TOPIC_MOTION = os.getenv('MQTT_TOPIC_MOTION', 'facebase/motion')
MQTT_TOPIC_ACCESS = os.getenv('MQTT_TOPIC_ACCESS', 'facebase/access')

# Hardware Pin Configuration
PIN_SERVO = int(os.getenv('FACEBASE_SERVO_PIN', 17))
PIN_PIR = int(os.getenv('FACEBASE_PIR_PIN', 4))
PIN_BUZZER = int(os.getenv('FACEBASE_BUZZER_PIN', 27))
UNLOCK_DURATION = int(os.getenv('FACEBASE_UNLOCK_SECONDS', 3))

# Servo Configuration
SERVO_LOCKED_ANGLE = 10
SERVO_UNLOCKED_ANGLE = 120

# Initialize Hardware
# Using default pin factory (RPi.GPIO or lgpio depending on what's installed)
# If jitter is an issue, we can switch back to pigpio later.
servo = AngularServo(PIN_SERVO, min_angle=0, max_angle=180, min_pulse_width=0.0005, max_pulse_width=0.0025)
pir = MotionSensor(PIN_PIR)
buzzer = None

try:
    buzzer = Buzzer(PIN_BUZZER)
except Exception as e:
    print(f"Warning: Buzzer not initialized: {e}")

# Global state
last_motion_time = 0
MOTION_COOLDOWN = 5  # Seconds between motion events

# --- Servo Helper Functions ---

def lock():
    """Moves servo to the locked position."""
    print(f"Locking door (Angle: {SERVO_LOCKED_ANGLE})...")
    try:
        servo.angle = SERVO_LOCKED_ANGLE
        time.sleep(0.5)
        servo.detach() # Stop sending signal to prevent jitter
    except Exception as e:
        print(f"Error locking door: {e}")

def unlock():
    """Moves servo to the unlocked position."""
    print(f"Unlocking door (Angle: {SERVO_UNLOCKED_ANGLE})...")
    try:
        servo.angle = SERVO_UNLOCKED_ANGLE
        time.sleep(0.5)
        servo.detach()
    except Exception as e:
        print(f"Error unlocking door: {e}")

# --- MQTT Handlers ---

def on_connect(client, userdata, flags, rc, properties=None):
    print(f"Connected with result code {rc}")
    client.subscribe(MQTT_TOPIC_ACCESS)

def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
        print(f"Received message on {msg.topic}: {payload}")
        
        result = payload.get('result')
        
        if result == 'allowed':
            handle_unlock()
        elif result == 'denied':
            handle_denied()
        elif result == 'cooldown':
            handle_cooldown()
            
    except json.JSONDecodeError:
        print("Failed to decode JSON payload")

def handle_unlock():
    print("Access GRANTED. Initiating unlock sequence...")
    
    # Visual/Audio Feedback
    if buzzer:
        # 3 short beeps
        for _ in range(3):
            buzzer.on()
            time.sleep(0.1)
            buzzer.off()
            time.sleep(0.1)
            
    # Unlock Action
    unlock()
    
    # Wait
    time.sleep(UNLOCK_DURATION)
    
    # Lock Action
    lock()
    print("Door re-locked.")

def handle_denied():
    print("Access DENIED.")
    if buzzer:
        # 1 long beep
        buzzer.on()
        time.sleep(1.0)
        buzzer.off()

def handle_cooldown():
    print("Cooldown active.")
    if buzzer:
        # 2 medium beeps
        for _ in range(2):
            buzzer.on()
            time.sleep(0.3)
            buzzer.off()
            time.sleep(0.2)

def motion_loop(client):
    global last_motion_time
    print("Starting motion detection loop...")
    while True:
        if pir.motion_detected:
            current_time = time.time()
            if current_time - last_motion_time > MOTION_COOLDOWN:
                print("Motion detected! Publishing event...")
                client.publish(MQTT_TOPIC_MOTION, json.dumps({"event": "motion_detected"}))
                last_motion_time = current_time
        time.sleep(0.1)

def main():
    # Set initial state to locked
    lock()

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    
    if MQTT_USERNAME and MQTT_PASSWORD:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
        
    if MQTT_PORT == 8883:
        client.tls_set()

    client.on_connect = on_connect
    client.on_message = on_message

    print(f"Connecting to MQTT broker at {MQTT_BROKER}:{MQTT_PORT}...")
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
    except Exception as e:
        print(f"Failed to connect to MQTT broker: {e}")
        return

    client.loop_start()

    try:
        motion_loop(client)
    except KeyboardInterrupt:
        print("Exiting...")
        servo.detach()
        if buzzer:
            buzzer.off()
        client.loop_stop()
        client.disconnect()

if __name__ == '__main__':
    main()
