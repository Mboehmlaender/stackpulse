#!/bin/bash
set -e

echo "🚀 Starte StackPulse Dev-Umgebung..."

cd backend
npm install
npm start &
BACK_PID=$!
cd ..

cd frontend
npm install
npm run dev &
FRONT_PID=$!
cd ..

echo ""
echo "✅ StackPulse läuft lokal:"
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:4000"
echo "Beenden mit STRG+C"

wait $BACK_PID $FRONT_PID
