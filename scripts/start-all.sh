#!/bin/bash

# Cleanup function to kill Docker kestra when script exits
cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    echo "Stopping Kestra Container..."
    docker rm -f kestra-local >/dev/null 2>&1
    exit
}

# Trap Ctrl+C (SIGINT) and regular exit
trap cleanup SIGINT EXIT

echo "🧹 Cleaning up ports 3001 (Backend) and 8080 (Kestra)..."
lsof -ti:3001 | xargs kill -9 2>/dev/null
# Ensure no lingering Kestra container
docker rm -f kestra-local >/dev/null 2>&1

echo "🚀 Starting Kestra Server (Docker)..."

# Move to backend directory for backend startup later
cd backend

# Run Kestra in Docker (Background)
# Ensure proper Project Root calculation
PROJECT_ROOT=$(pwd)
if [[ $PROJECT_ROOT == */scripts ]]; then
  PROJECT_ROOT=$(dirname "$PROJECT_ROOT")
fi
if [[ $PROJECT_ROOT == */backend ]]; then
  PROJECT_ROOT=$(dirname "$PROJECT_ROOT")
fi

echo "📂 Project Root: $PROJECT_ROOT"

echo "⏳ Checking Docker..."
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker."
  exit 1
fi

echo "🛑 Cleaning up old Kestra container..."
docker stop kestra-local >/dev/null 2>&1 || true
docker rm kestra-local >/dev/null 2>&1 || true

echo "🚀 Starting Kestra (Docker)..."
# Using absolute paths derived from PROJECT_ROOT for reliability
# Note: Kestra 0.24+ requires authentication with username/password set directly.
# The 'enabled' flag is ignored in 0.24+; setting username/password is what matters.
# You can override these via KESTRA_USERNAME and KESTRA_PASSWORD environment variables.
KESTRA_USER="${KESTRA_USERNAME:-admin@kestra.io}"
KESTRA_PASS="${KESTRA_PASSWORD:-Admin1234}"

docker run -d --pull=always --name kestra-local \
  -p 8080:8080 \
  --user=root \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp:/tmp \
  -v "$PROJECT_ROOT/backend":/app/backend \
  -e KESTRA_CONFIGURATION="kestra:
  server:
    basic-auth:
      username: ${KESTRA_USER}
      password: ${KESTRA_PASS}" \
  kestra/kestra:latest server local

echo "   Kestra Container ID: kestra-local"

echo "⏳ Waiting for Kestra to initialize (http://localhost:8080)..."
MAX_RETRIES=30
COUNT=0
# Check configs endpoint to verifying it's up (200 OK)
until curl -s -f http://localhost:8080/api/v1/configs > /dev/null; do
    sleep 2
    echo -n "."
    COUNT=$((COUNT+1))
    if [ $COUNT -ge $MAX_RETRIES ]; then
        echo "❌ Kestra failed to start within 60 seconds."
        echo "Example Logs from Container:"
        docker logs --tail 50 kestra-local
        exit 1
    fi
done
echo ""
echo "✅ Kestra is ONLINE!"

# Deploy flows to Kestra
echo "📦 Deploying Kestra Flows..."
FLOW_FILES="$PROJECT_ROOT/backend/kestra/flows/*.yml"
for flow_file in $FLOW_FILES; do
  if [ -f "$flow_file" ]; then
    echo "   Deploying: $(basename $flow_file)"
    curl -s -X POST "http://localhost:8080/api/v1/flows/import" \
      -u "$KESTRA_USER:$KESTRA_PASS" \
      -H "Content-Type: multipart/form-data" \
      -F "fileUpload=@$flow_file" > /dev/null 2>&1
  fi
done
echo "✅ Flows Deployed."

echo "🚀 Starting Backend..."
# Already in backend directory
# Export Kestra credentials so the backend can authenticate
export KESTRA_USERNAME="${KESTRA_USERNAME:-admin@kestra.io}"
export KESTRA_PASSWORD="${KESTRA_PASSWORD:-Admin1234}"
export USE_KESTRA=true
export PORT=3001
npm run start:dev

