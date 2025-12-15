FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Environment Defaults (all configurable)
ENV BACKEND_URL=http://host.docker.internal:3001/api/sidecar
ENV LOG_PATH=/app/logs/app.log
ENV SERVICE_ID=python-ml-sidecar

# Detection tuning
ENV LEARNING_PERIOD=300
ENV FREQ_THRESHOLD_ERROR=50
ENV FREQ_THRESHOLD_FLOOD=200
ENV LATENCY_THRESHOLD=5.0
ENV RATE_LIMIT_MAX=20
ENV HEARTBEAT_INTERVAL=30

# Create logs directory
RUN mkdir -p /app/logs

# Use exec form for proper signal handling
CMD ["python", "-u", "main.py"]
