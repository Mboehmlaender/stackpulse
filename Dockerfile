# Stage 1: Frontend build
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend + static frontend
FROM node:20-alpine AS runtime
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --only=production
COPY backend/ ./
COPY --from=frontend-build /app/frontend/build ./public

ENV NODE_ENV=production
EXPOSE 4000  # Port wird über .env gesetzt

RUN chown -R node:node /app/backend
USER node

CMD ["node", "index.js"]
