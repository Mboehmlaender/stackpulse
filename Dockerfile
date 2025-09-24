# ===============================
# Stage 1: Frontend Build
# ===============================
FROM node:20-alpine AS frontend-build

# Arbeitsverzeichnis
WORKDIR /app/frontend

# Nur package.json & package-lock.json kopieren und Dependencies installieren
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Restliche Frontend-Dateien kopieren
COPY frontend/ ./

# Frontend Build erzeugen (statische Dateien)
RUN npm run build


# ===============================
# Stage 2: Backend + Frontend
# ===============================
FROM node:20-alpine AS runtime

# Arbeitsverzeichnis
WORKDIR /app/backend

# Backend Dependencies installieren
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --only=production

# Backend-Code kopieren
COPY backend/ ./

# public leeren
RUN rm -rf ./public/*

# Inhalt von dist inklusive Unterordner direkt nach public kopieren
COPY --from=frontend-build /app/frontend/dist/. ./public/

# Environment
ENV NODE_ENV=production

# Ports
# Backend intern: 4001
# Frontend exposed: 5173
EXPOSE 5173

# Node User
USER node

# Container startet das Backend (liefert statisches Frontend)
CMD ["node", "index.js"]
