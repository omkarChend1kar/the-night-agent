.PHONY: kill-backend start-backend

# Kill any process running on port 3001 (Backend)
kill-backend:
	@echo "🧹 Checking for zombie processes on port 3001..."
	@-lsof -ti:3001 | xargs kill -9 2>/dev/null || echo "✅ Port 3001 is clean"

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
