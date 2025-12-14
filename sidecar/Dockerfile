FROM python:3.11-slim

WORKDIR /app

# Install build deps if needed (usually simple pip packages don't need much)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Environment Defaults
ENV BACKEND_URL=http://host.docker.internal:3001/api/sidecar
ENV LOG_PATH=/app/logs/app.log
ENV SERVICE_ID=my-service

# Sidecar Identity (set these when running the container)
ENV SIDECAR_ID=""
ENV SIDECAR_API_KEY=""

# Make directory for logs
RUN mkdir -p /app/logs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.post('${BACKEND_URL}/heartbeat', timeout=5)" || exit 1

CMD ["python", "main.py"]
