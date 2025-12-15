.PHONY: kill-backend start-backend backend kill-frontend frontend

# Kill any process running on port 3001 (Backend)
kill-backend:
	@echo "🧹 Checking for zombie processes on port 3001..."
	@-lsof -ti:3001 | xargs kill -9 2>/dev/null || echo "✅ Port 3001 is clean"

# Start backend server only (for use in start-all.sh)
start-backend: kill-backend
	@echo "🚀 Starting Backend Server..."
	@echo "   Kestra Auth: ${KESTRA_USERNAME:-admin@kestra.io}"
	@cd backend && \
		KESTRA_USERNAME="${KESTRA_USERNAME:-admin@kestra.io}" \
		KESTRA_PASSWORD="${KESTRA_PASSWORD:-Admin1234}" \
		USE_KESTRA=true \
		PORT=3001 \
		npm run start:dev

# Restart the backend cleanly
backend: kill-backend
	@echo "🚀 Starting Full Stack (Kestra Docker + Backend)..."
	@./scripts/start-all.sh

# Kill any process running on port 3000 (Frontend)
kill-frontend:
	@echo "🧹 Checking for zombie processes on port 3000..."
	@-lsof -ti:3000 | xargs kill -9 2>/dev/null || echo "✅ Port 3000 is clean"

# Clean start for frontend
frontend: kill-frontend
	@echo "🚀 Starting Frontend..."
	@cd frontend && npm run dev

# Start both backend and frontend concurrently
start-all: kill-backend kill-frontend
	@echo "🚀 Starting Full Stack (Frontend + Backend + Kestra)..."
	@./scripts/start-all.sh

