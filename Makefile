.PHONY: kill-backend start-backend

# Kill any process running on port 3001 (Backend)
kill-backend:
	@echo "🧹 Checking for zombie processes on port 3001..."
	@-lsof -ti:3001 | xargs kill -9 2>/dev/null || echo "✅ Port 3001 is clean"

# Restart the backend cleanly
backend: kill-backend
	@echo "🚀 Starting Full Stack (Kestra + Backend)..."
	@./scripts/start-all.sh

# Clean start for frontend (optional, just in case)
frontend:
	@echo "🚀 Starting Frontend..."
	@cd frontend && npm run dev
