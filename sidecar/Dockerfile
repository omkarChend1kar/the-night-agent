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
ENV SERVICE_ID=python-ml-sidecar

# Make directory for logs
RUN mkdir -p /app/logs

CMD ["python", "main.py"]
