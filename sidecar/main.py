"""
Night Agent Sidecar - Production-Ready Log Monitoring Agent

Features:
- Statistical & rule-based anomaly detection
- Graceful shutdown handling (SIGTERM/SIGINT)
- Rate limiting for anomaly reports
- Configurable thresholds via environment variables
- Auto-restart on monitor failure
"""

import logging
import requests
import json
import uuid
import time
import os
import signal
import sys
from collections import deque
from detector import AnomalyDetector
from monitor import LogMonitor

# Setup Logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("Sidecar")

# =============================================================================
# CONFIGURATION (All externalized to environment variables)
# =============================================================================
BACKEND_URL = os.getenv("BACKEND_URL", "http://host.docker.internal:3001/api/sidecar")
SERVICE_ID = os.getenv("SERVICE_ID", "my-service")
LOG_PATH = os.getenv("LOG_PATH", "./test.log")

# Sidecar Identity (for authenticated communication)
SIDECAR_ID = os.getenv("SIDECAR_ID", "")
SIDECAR_API_KEY = os.getenv("SIDECAR_API_KEY", "")

# Tunable thresholds
HEARTBEAT_INTERVAL = int(os.getenv("HEARTBEAT_INTERVAL", "30"))
RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_MAX", "20"))  # Max anomalies per minute
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))  # Window in seconds

# Detector configuration (passed to AnomalyDetector)
DETECTOR_CONFIG = {
    "learning_period": int(os.getenv("LEARNING_PERIOD", "300")),  # 5 minutes
    "freq_threshold_error": int(os.getenv("FREQ_THRESHOLD_ERROR", "50")),
    "freq_threshold_flood": int(os.getenv("FREQ_THRESHOLD_FLOOD", "200")),
    "latency_threshold": float(os.getenv("LATENCY_THRESHOLD", "5.0")),
    "sequence_prob_threshold": float(os.getenv("SEQUENCE_PROB_THRESHOLD", "0.05")),
}

# =============================================================================
# GLOBAL STATE
# =============================================================================
detector = AnomalyDetector(config=DETECTOR_CONFIG)
monitor = None  # Will be set in main()
anomaly_timestamps = deque(maxlen=RATE_LIMIT_MAX * 2)  # Track recent anomaly times
shutdown_requested = False


def get_auth_headers():
    """Get authentication headers for API calls"""
    headers = {"Content-Type": "application/json"}
    if SIDECAR_API_KEY:
        headers["X-Sidecar-API-Key"] = SIDECAR_API_KEY
    return headers


def is_rate_limited():
    """Check if we've exceeded the rate limit for anomaly reports"""
    now = time.time()
    cutoff = now - RATE_LIMIT_WINDOW
    
    # Count anomalies in the window
    recent = sum(1 for ts in anomaly_timestamps if ts > cutoff)
    
    if recent >= RATE_LIMIT_MAX:
        return True
    return False


def send_anomaly(anomaly_data):
    """
    Sends structured anomaly event to the backend with rate limiting.
    """
    # Check rate limit
    if is_rate_limited():
        logger.warning(f"⚠️ Rate limit exceeded ({RATE_LIMIT_MAX}/{RATE_LIMIT_WINDOW}s), skipping anomaly")
        return
    
    # Record this anomaly time
    anomaly_timestamps.append(time.time())
    
    # Extract severity from the original log line
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
    
    # Construct payload matching the backend expectation
    payload = {
        "id": f"evt-{uuid.uuid4()}",
        "sidecarId": SIDECAR_ID or f"sidecar-{SERVICE_ID}", 
        "serviceId": SERVICE_ID,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "severity": detected_severity,
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
            logger.info(f"✅ Anomaly reported: {payload['id']} ({anomaly_data['anomaly_type']})")
        else:
            logger.error(f"❌ Failed to report anomaly: {response.status_code} - {response.text}")
    except requests.exceptions.Timeout:
        logger.error("❌ Timeout sending anomaly to backend")
    except requests.exceptions.ConnectionError:
        logger.error("❌ Connection error sending anomaly to backend")
    except Exception as e:
        logger.error(f"❌ Error sending anomaly: {e}")


def handle_log_line(line):
    """Process a single log line through the anomaly detector"""
    if shutdown_requested:
        return
        
    try:
        anomaly = detector.check(line)
        
        if anomaly:
            logger.info(f"🚨 ANOMALY DETECTED: {anomaly['summary']} (Conf: {anomaly['confidence']:.2f})")
            send_anomaly(anomaly)
        else:
            # Debug level to avoid log spam
            logger.debug(f"Line processed, no anomaly: {line[:60]}...")
    except Exception as e:
        logger.error(f"Error processing log line: {e}", exc_info=True)


def shutdown_handler(signum, frame):
    """Handle graceful shutdown on SIGTERM/SIGINT"""
    global shutdown_requested, monitor
    
    signal_name = signal.Signals(signum).name
    logger.info(f"🛑 Received {signal_name}, initiating graceful shutdown...")
    
    shutdown_requested = True
    
    if monitor:
        monitor.stop()
        logger.info("✅ Log monitor stopped")
    
    logger.info("👋 Sidecar shutdown complete")
    sys.exit(0)


def register_with_backend():
    """Register sidecar with backend on startup"""
    try:
        response = requests.post(
            f"{BACKEND_URL}/register", 
            json={"sidecarId": SIDECAR_ID, "serviceId": SERVICE_ID},
            headers=get_auth_headers(),
            timeout=5
        )
        if response.status_code in [200, 201]:
            logger.info("✅ Registered with backend successfully")
            return True
        else:
            logger.warning(f"⚠️ Registration returned: {response.status_code}")
            return False
    except Exception as e:
        logger.warning(f"⚠️ Could not register with backend: {e}")
        return False


def heartbeat_loop():
    """Send periodic heartbeats to backend"""
    failures = 0
    
    while not shutdown_requested:
        try:
            response = requests.post(
                f"{BACKEND_URL}/heartbeat", 
                json={"sidecarId": SIDECAR_ID},
                headers=get_auth_headers(),
                timeout=2
            )
            if response.status_code in [200, 201]:
                failures = 0
            else:
                failures += 1
                if failures >= 3:
                    logger.warning(f"⚠️ Heartbeat failing (attempt {failures}): {response.status_code}")
        except Exception as e:
            failures += 1
            if failures >= 3:
                logger.warning(f"⚠️ Heartbeat connection failed (attempt {failures}): {e}")
        
        time.sleep(HEARTBEAT_INTERVAL)


def main():
    global monitor
    
    # Setup signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, shutdown_handler)
    signal.signal(signal.SIGINT, shutdown_handler)
    
    logger.info("=" * 60)
    logger.info("🌙 Starting Night Agent Sidecar (Production Mode)")
    logger.info("=" * 60)
    logger.info(f"Sidecar ID: {SIDECAR_ID or 'Not configured'}")
    logger.info(f"Service ID: {SERVICE_ID}")
    logger.info(f"Log Path: {LOG_PATH}")
    logger.info(f"Backend URL: {BACKEND_URL}")
    logger.info(f"Auth: {'API Key configured' if SIDECAR_API_KEY else 'No API key'}")
    logger.info(f"Rate Limit: {RATE_LIMIT_MAX} anomalies / {RATE_LIMIT_WINDOW}s")
    logger.info(f"Learning Period: {DETECTOR_CONFIG['learning_period']}s")
    logger.info(f"Heartbeat Interval: {HEARTBEAT_INTERVAL}s")
    logger.info("Mode: Statistical & Rule-Based Anomaly Detection")
    logger.info("=" * 60)
    
    # Register with backend
    register_with_backend()
    
    # Create log file if not exists
    if not os.path.exists(LOG_PATH):
        log_dir = os.path.dirname(LOG_PATH)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
        with open(LOG_PATH, 'w') as f:
            f.write(f'{{"timestamp": "{time.strftime("%Y-%m-%dT%H:%M:%SZ")}", "message": "Sidecar started", "level": "INFO"}}\n')
        logger.info(f"📝 Created log file: {LOG_PATH}")

    # Start log monitor with auto-restart
    monitor = LogMonitor(LOG_PATH, handle_log_line, auto_restart=True)
    monitor.start()
    logger.info(f"📡 Monitoring: {LOG_PATH}")

    # Heartbeat loop (blocking)
    heartbeat_loop()


if __name__ == "__main__":
    main()
