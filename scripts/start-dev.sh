#!/bin/bash
set -e

echo "🚀 Starte StackPulse Dev-Umgebung..."

# --- Backend ---
cd backend
npm install
npm start &
BACK_PID=$!
cd ..

# --- Frontend ---
cd frontend
npm install
npm run dev &
FRONT_PID=$!

# Optional: Kopiere Build-Dateien für Backend /public (nur für statisches Testen)
npm run build
cp -r dist ../backend/public

cd ..

echo ""
echo "✅ StackPulse läuft lokal:"
echo "Frontend (Vite Dev): http://localhost:5173"
echo "Backend API:      http://localhost:3300"
echo "Frontend (statisch im Backend/public): http://localhost:4000"
echo "Beenden mit STRG+C"

# Prozesse überwachen
wait $BACK_PID $FRONT_PID
