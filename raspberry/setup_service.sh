#!/bin/bash

# Define variables
SERVICE_NAME="facebase_mqtt"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
SCRIPT_DIR=$(pwd)
USER_NAME=$USER
PYTHON_EXEC="${SCRIPT_DIR}/.venv/bin/python"
SCRIPT_PATH="${SCRIPT_DIR}/mqtt_client.py"

# Check if running as root (we need sudo for systemctl and writing to /etc)
if [ "$EUID" -eq 0 ]; then
  echo "Please run this script without sudo, but ensure you have sudo privileges."
  exit 1
fi

echo "Setting up ${SERVICE_NAME} service..."
echo "User: ${USER_NAME}"
echo "Directory: ${SCRIPT_DIR}"
echo "Python Executable: ${PYTHON_EXEC}"

# Check if .venv exists
if [ ! -f "$PYTHON_EXEC" ]; then
    echo "Error: Virtual environment python not found at $PYTHON_EXEC"
    echo "Please ensure you have created the virtual environment in .venv"
    exit 1
fi

# Create the service file content
# We use 'root' as the user because the user requested sudo access for HW PWM
SERVICE_CONTENT="[Unit]
Description=FaceBase MQTT Client Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${SCRIPT_DIR}
ExecStart=${PYTHON_EXEC} ${SCRIPT_PATH}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target"

# Write the service file (requires sudo)
echo "Creating service file at ${SERVICE_FILE}..."
echo "$SERVICE_CONTENT" | sudo tee "$SERVICE_FILE" > /dev/null

# Reload systemd, enable and start the service
echo "Reloading systemd daemon..."
sudo systemctl daemon-reload

echo "Enabling ${SERVICE_NAME} service..."
sudo systemctl enable ${SERVICE_NAME}

echo "Starting ${SERVICE_NAME} service..."
sudo systemctl start ${SERVICE_NAME}

echo "Status of ${SERVICE_NAME}:"
sudo systemctl status ${SERVICE_NAME} --no-pager

echo "Setup complete! The MQTT client should now start automatically on boot."
