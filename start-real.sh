#!/bin/bash
echo "🚀 Starting The Night Agent in REAL MODE..."

# Check dependencies
if ! command -v cline &> /dev/null; then
    echo "❌ 'cline' CLI not found. Please run 'npm install -g cline'."
    exit 1
fi

if ! command -v java &> /dev/null; then
    echo "❌ 'java' not found. Kestra requires Java 21+."
    exit 1
fi

# Set Environment Variables
export USE_KESTRA=true
export USE_CLINE=true

# Check if Kestra is running (simple port check)
# In production, we'd want a more robust check.
echo "ℹ️  Assuming Kestra is running on localhost:8080..."

# Start Backend
echo "📦 Starting Backend..."
cd backend
npm run start
