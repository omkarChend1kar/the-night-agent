import logging
import requests
import json
import uuid
import time
import os
import signal
import sys
from detector import AnomalyDetector
from monitor import LogMonitor

# Setup Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("Sidecar")

# Configuration
BACKEND_URL = os.getenv("BACKEND_URL", "http://host.docker.internal:3001/api/sidecar")
SERVICE_ID = os.getenv("SERVICE_ID", "service-1")
LOG_PATH = os.getenv("LOG_PATH", "./test.log")

detector = AnomalyDetector()

def send_anomaly(anomaly_data):
    """
    Sends structured anomaly event to the backend.
    """
    # Construct payload matching the user requirements + backend expectation
    payload = {
        "id": f"evt-{uuid.uuid4()}",
        "sidecarId": f"sidecar-{SERVICE_ID}", 
        "serviceId": SERVICE_ID,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "severity": "high" if anomaly_data['confidence'] > 0.8 else "medium",
        "message": anomaly_data['summary'],
        "logs": [anomaly_data['evidence']['log']],
        "traceId": f"trace-{uuid.uuid4()}",
        "confidence": anomaly_data['confidence'],
        "anomaly_type": anomaly_data['anomaly_type'],
        "context": anomaly_data['context'],
        "evidence": anomaly_data['evidence']
    }
    
    try:
        url = f"{BACKEND_URL}/anomaly"
        # Backend might not accept extra fields "context" and "evidence" at root if it's strict,
        # but the prompt asked to return JSON with those fields.
        # We will assume the backend stores the full blob or we pack it into 'metadata' if needed.
        # For now, sending as is.
        response = requests.post(url, json=payload, timeout=5)
        if response.status_code in [200, 201]:
            logger.info(f"Anomaly reported: {payload['id']} ({anomaly_data['anomaly_type']})")
        else:
            logger.error(f"Failed to report anomaly: {response.status_code} - {response.text}")
    except Exception as e:
        logger.error(f"Error sending anomaly: {e}")

def handle_log_line(line):
    # Pass directly to our new statistical detector
    anomaly = detector.check(line)
    
    if anomaly:
        # We found something interesting
        print(f"🚨 {anomaly['summary']} (Conf: {anomaly['confidence']})")
        send_anomaly(anomaly)

def main():
    logger.info("Starting Night Agent Context-Aware Sidecar...")
    logger.info("Mode: Statistical & Rule-Based Anomaly Detection")
    
    # Create dummy log if not exists
    if not os.path.exists(LOG_PATH):
        with open(LOG_PATH, 'w') as f:
            f.write(f'{{"timestamp": "{time.strftime("%Y-%m-%dT%H:%M:%SZ")}", "message": "Sidecar started", "level": "INFO"}}\n')

    monitor = LogMonitor(LOG_PATH, handle_log_line)
    monitor.start()

    # Heartbeat Loop
    try:
        while True:
            try:
                requests.post(f"{BACKEND_URL}/heartbeat", timeout=2)
            except:
                pass 
            time.sleep(30)
    except KeyboardInterrupt:
        monitor.stop()
        logger.info("Stopping Sidecar...")

if __name__ == "__main__":
    main()
