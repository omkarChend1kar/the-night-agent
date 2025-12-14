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
SERVICE_ID = os.getenv("SERVICE_ID", "my-service")
LOG_PATH = os.getenv("LOG_PATH", "./test.log")

# Sidecar Identity (for authenticated communication)
SIDECAR_ID = os.getenv("SIDECAR_ID", "")
SIDECAR_API_KEY = os.getenv("SIDECAR_API_KEY", "")

detector = AnomalyDetector()

def get_auth_headers():
    """Get authentication headers for API calls"""
    headers = {"Content-Type": "application/json"}
    if SIDECAR_API_KEY:
        headers["X-Sidecar-API-Key"] = SIDECAR_API_KEY
    return headers

def send_anomaly(anomaly_data):
    """
    Sends structured anomaly event to the backend.
    """
    # Extract severity from the original log line
    # The detector should have extracted it, but we need to get it from the evidence
    log_line = anomaly_data.get('evidence', {}).get('log', '')
    detected_severity = 'INFO'  # Default
    
    # Try to detect severity from log line
    log_upper = log_line.upper()
    if '❌' in log_line or 'ERROR:' in log_upper or 'ERROR ' in log_upper:
        detected_severity = 'ERROR'
    elif '⚠️' in log_line or 'WARN:' in log_upper or 'WARNING:' in log_upper:
        detected_severity = 'WARN'
    elif 'CRITICAL:' in log_upper or 'FATAL:' in log_upper:
        detected_severity = 'CRITICAL'
    elif 'INFO:' in log_upper:
        detected_severity = 'INFO'
    elif 'DEBUG:' in log_upper:
        detected_severity = 'DEBUG'
    
    # Construct payload matching the user requirements + backend expectation
    payload = {
        "id": f"evt-{uuid.uuid4()}",
        "sidecarId": SIDECAR_ID or f"sidecar-{SERVICE_ID}", 
        "serviceId": SERVICE_ID,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "severity": detected_severity,  # Use actual severity from log, not confidence-based
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
        response = requests.post(url, json=payload, headers=get_auth_headers(), timeout=5)
        if response.status_code in [200, 201]:
            logger.info(f"Anomaly reported: {payload['id']} ({anomaly_data['anomaly_type']})")
        else:
            logger.error(f"Failed to report anomaly: {response.status_code} - {response.text}")
    except Exception as e:
        logger.error(f"Error sending anomaly: {e}")

def handle_log_line(line):
    # Pass directly to our new statistical detector
    try:
        anomaly = detector.check(line)
        
        if anomaly:
            # We found something interesting
            logger.info(f"🚨 ANOMALY DETECTED: {anomaly['summary']} (Conf: {anomaly['confidence']})")
            print(f"🚨 {anomaly['summary']} (Conf: {anomaly['confidence']})")
            send_anomaly(anomaly)
        else:
            # Log when detector is called but no anomaly (for debugging) - use INFO level for visibility
            logger.info(f"Line processed, no anomaly detected: {line[:80]}...")
    except Exception as e:
        logger.error(f"Error processing log line: {e}", exc_info=True)

def main():
    logger.info("=" * 50)
    logger.info("🌙 Starting Night Agent Sidecar")
    logger.info("=" * 50)
    logger.info(f"Sidecar ID: {SIDECAR_ID or 'Not configured'}")
    logger.info(f"Service ID: {SERVICE_ID}")
    logger.info(f"Log Path: {LOG_PATH}")
    logger.info(f"Backend URL: {BACKEND_URL}")
    logger.info(f"Auth: {'API Key configured' if SIDECAR_API_KEY else 'No API key'}")
    logger.info("Mode: Statistical & Rule-Based Anomaly Detection")
    logger.info("=" * 50)
    
    # Register with backend
    try:
        response = requests.post(
            f"{BACKEND_URL}/register", 
            json={"sidecarId": SIDECAR_ID, "serviceId": SERVICE_ID},
            headers=get_auth_headers(),
            timeout=5
        )
        if response.status_code in [200, 201]:
            logger.info("✅ Registered with backend successfully")
        else:
            logger.warning(f"⚠️ Registration returned: {response.status_code}")
    except Exception as e:
        logger.warning(f"⚠️ Could not register with backend: {e}")
    
    # Create dummy log if not exists
    if not os.path.exists(LOG_PATH):
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        with open(LOG_PATH, 'w') as f:
            f.write(f'{{"timestamp": "{time.strftime("%Y-%m-%dT%H:%M:%SZ")}", "message": "Sidecar started", "level": "INFO"}}\n')

    monitor = LogMonitor(LOG_PATH, handle_log_line)
    monitor.start()
    logger.info(f"📡 Monitoring: {LOG_PATH}")

    # Heartbeat Loop
    try:
        while True:
            try:
                requests.post(
                    f"{BACKEND_URL}/heartbeat", 
                    json={"sidecarId": SIDECAR_ID},
                    headers=get_auth_headers(),
                    timeout=2
                )
            except:
                pass 
            time.sleep(30)
    except KeyboardInterrupt:
        monitor.stop()
        logger.info("🛑 Stopping Sidecar...")

if __name__ == "__main__":
    main()
