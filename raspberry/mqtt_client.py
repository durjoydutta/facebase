import os
import time
import json
import threading
import paho.mqtt.client as mqtt
import pigpio
from gpiozero import MotionSensor, Buzzer
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
SERVO_LOCKED_ANGLE = 12
SERVO_UNLOCKED_ANGLE = 97

# Initialize Hardware
pi = pigpio.pi()
if not pi.connected:
    print("Error: Could not connect to pigpio daemon. Is it running? (sudo pigpiod)")
    exit(1)

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

def set_angle(angle):
    """
    Sets the servo to a specific angle (0-180).
    Maps angle to pulse width (500-2500us).
    """
    if angle < 0: angle = 0
    if angle > 180: angle = 180
    
    pulse_width = 500 + (angle / 180.0) * 2000
    pi.set_servo_pulsewidth(PIN_SERVO, pulse_width)

def lock():
    """Moves servo to the locked position."""
    print(f"Locking door (Angle: {SERVO_LOCKED_ANGLE})...")
    set_angle(SERVO_LOCKED_ANGLE)
    # Allow time for movement
    time.sleep(0.5)
    # Optional: Turn off servo signal to prevent jitter/humming if holding torque isn't needed
    # pi.set_servo_pulsewidth(PIN_SERVO, 0)

def unlock():
    """Moves servo to the unlocked position."""
    print(f"Unlocking door (Angle: {SERVO_UNLOCKED_ANGLE})...")
    set_angle(SERVO_UNLOCKED_ANGLE)

# --- MQTT Handlers ---

def on_connect(client, userdata, flags, rc, properties=None):
    print(f"Connected with result code {rc}")
    client.subscribe(MQTT_TOPIC_ACCESS)

def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
        print(f"Received message on {msg.topic}: {payload}")
        
        result = payload.get('result')
        
        if result == 'unlocked':
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
        # Ensure locked on exit? Or just stop.
        pi.set_servo_pulsewidth(PIN_SERVO, 0) # Stop servo
        pi.stop()
        if buzzer:
            buzzer.off()
        client.loop_stop()
        client.disconnect()

if __name__ == '__main__':
    main()
