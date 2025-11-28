import time
import os
from gpiozero import AngularServo
from dotenv import load_dotenv

# Load environment variables
load_dotenv('../.env.local')

# Configuration
PIN_SERVO = int(os.getenv('FACEBASE_SERVO_PIN', 17))
SERVO_LOCKED_ANGLE = 12
SERVO_UNLOCKED_ANGLE = 97

print(f"Testing Servo on GPIO {PIN_SERVO}...")

try:
    # Initialize Servo
    # Using the same parameters as the main client
    servo = AngularServo(PIN_SERVO, min_angle=0, max_angle=180, min_pulse_width=0.0005, max_pulse_width=0.0025)

    print(f"Moving to LOCKED position ({SERVO_LOCKED_ANGLE} degrees)...")
    servo.angle = SERVO_LOCKED_ANGLE
    time.sleep(1)
    
    print(f"Moving to UNLOCKED position ({SERVO_UNLOCKED_ANGLE} degrees)...")
    servo.angle = SERVO_UNLOCKED_ANGLE
    time.sleep(1)

    print(f"Moving back to LOCKED position ({SERVO_LOCKED_ANGLE} degrees)...")
    servo.angle = SERVO_LOCKED_ANGLE
    time.sleep(1)
    
    # Detach to stop jitter
    servo.detach()
    print("Test complete.")

except Exception as e:
    print(f"Error: {e}")
except KeyboardInterrupt:
    print("\nTest cancelled.")
