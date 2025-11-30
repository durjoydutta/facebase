import os
import time
import json
import threading
import paho.mqtt.client as mqtt
from gpiozero import MotionSensor, Buzzer
from rpi_hardware_pwm import HardwarePWM

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
# Note: HardwarePWM uses channel index. Channel 0 is usually GPIO 18.
PIN_SERVO_CHANNEL = 0 
PIN_PIR = int(os.getenv('FACEBASE_PIR_PIN', 4))
PIN_BUZZER = int(os.getenv('FACEBASE_BUZZER_PIN', 27))
UNLOCK_DURATION = int(os.getenv('FACEBASE_UNLOCK_SECONDS', 3))

# Servo Configuration
SERVO_LOCKED_ANGLE = 130
SERVO_UNLOCKED_ANGLE = 10

# Initialize Hardware
# Using rpi-hardware-pwm for Hardware PWM to prevent jitter.
# REQUIREMENT: Enable PWM overlay in /boot/config.txt
try:
    servo = HardwarePWM(pwm_channel=PIN_SERVO_CHANNEL, hz=50)
    servo.start(0) # Start with 0 duty cycle
except Exception as e:
    print(f"Error initializing HardwarePWM: {e}")
    print("Make sure to enable PWM overlay in /boot/config.txt")
    servo = None

# SG90 Duty Cycles (approximate for 50Hz):
# 0 deg = 2.5%
# 90 deg = 7.5%
# 180 deg = 12.5%
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
    print(f"Locking door...")
    if not servo:
        print("Servo not initialized.")
        return
        
    try:
        # 130 degrees approx -> ~9.7% duty
        servo.change_duty_cycle(9.7)
        time.sleep(0.5)
        # Stop signal to prevent jitter/hum
        servo.change_duty_cycle(0) 
    except Exception as e:
        print(f"Error locking door: {e}")

def unlock():
    """Moves servo to the unlocked position."""
    print(f"Unlocking door...")
    if not servo:
        print("Servo not initialized.")
        return

    try:
        # 10 degrees approx -> ~3.0% duty
        servo.change_duty_cycle(3.0)
        time.sleep(0.5)
        # Stop signal
        servo.change_duty_cycle(0)
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
        user = payload.get('user', 'Unknown')
        is_banned = payload.get('banned', False)
        
        if result == 'allowed':
            handle_unlock(user)
        elif result == 'denied':
            handle_denied(user, is_banned)
        elif result == 'cooldown':
            handle_cooldown()
            
    except json.JSONDecodeError:
        print("Failed to decode JSON payload")

def handle_unlock(user="Unknown"):
    print(f"Access GRANTED to: {user}. Initiating unlock sequence...")
    
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

def handle_denied(user="Unknown", is_banned=False):
    print(f"Access DENIED for {user} (Banned: {is_banned})")
    
    if buzzer:
        if is_banned:
            # Banned Tone: 5 fast beeps (Urgent/Alert)
            for _ in range(5):
                buzzer.on()
                time.sleep(0.25)
                buzzer.off()
                time.sleep(0.25)
        else:
            # Unknown/Denied Tone: 1 long beep
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
    try:
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

        motion_loop(client)
        
    except KeyboardInterrupt:
        print("Exiting...")
    finally:
        print("Cleaning up resources...")
        if servo:
            servo.stop()
        if buzzer:
            buzzer.off()
        try:
            client.loop_stop()
            client.disconnect()
        except:
            pass

if __name__ == '__main__':
    main()
