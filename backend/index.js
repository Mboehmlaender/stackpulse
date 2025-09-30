import express from 'express';
import dotenv from 'dotenv';
import https from 'https';
import axios from 'axios';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db/index.js';
import { logRedeployEvent } from './db/redeployLogs.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = 4001;
const ENDPOINT_ID = Number(process.env.PORTAINER_ENDPOINT_ID);

const agent = new https.Agent({ rejectUnauthorized: false });
const axiosInstance = axios.create({
  httpsAgent: agent,
  headers: { "X-API-Key": process.env.PORTAINER_API_KEY },
  baseURL: process.env.PORTAINER_URL,
});

const redeployingStacks = {};

const server = http.createServer(app);
const io = new Server(server, {
  path: "/socket.io",
  cors: { origin: "*" }
});
io.on("connection", (socket) => {
  console.log(`🔌 [Socket] Client verbunden: ${socket.id}`);
});

const broadcastRedeployStatus = (stackId, status) => {
  redeployingStacks[stackId] = status;
  io.emit("redeployStatus", { stackId, status });
  console.log(`🔄 [RedeployStatus] Stack ${stackId} ist jetzt ${status ? "im Redeploy" : "fertig"}`);
};

// --- API Endpoints ---

// Stacks abrufen
app.get('/api/stacks', async (req, res) => {
  console.log("ℹ️ [API] GET /api/stacks: Abruf gestartet");
  try {
    const stacksRes = await axiosInstance.get('/api/stacks');
    const filteredStacks = stacksRes.data.filter(stack => stack.EndpointId === ENDPOINT_ID);

    const uniqueStacksMap = {};
    filteredStacks.forEach(stack => {
      if (!uniqueStacksMap[stack.Name]) uniqueStacksMap[stack.Name] = stack;
    });
    const uniqueStacks = Object.values(uniqueStacksMap);

    const stacksWithStatus = await Promise.all(
      uniqueStacks.map(async (stack) => {
        try {
          const statusRes = await axiosInstance.get(
            `/api/stacks/${stack.Id}/images_status?refresh=true`
          );
          const statusEmoji = statusRes.data.Status === 'outdated' ? '⚠️' : '✅';
          return { 
            ...stack, 
            updateStatus: statusEmoji, 
            redeploying: redeployingStacks[stack.Id] || false
          };
        } catch (err) {
          console.error(`❌ Fehler beim Abrufen des Status für Stack ${stack.Id}:`, err.message);
          return { ...stack, updateStatus: '❌', redeploying: redeployingStacks[stack.Id] || false };
        }
      })
    );

    stacksWithStatus.sort((a, b) => a.Name.localeCompare(b.Name));
    console.log(`✅ GET /api/stacks: Abruf erfolgreich, ${stacksWithStatus.length} Stacks geladen`);
    res.json(stacksWithStatus);
  } catch (err) {
    console.error(`❌ Fehler beim Abrufen der Stacks:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Redeploy-Logs abrufen
app.get('/api/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const valueToArray = (value) => {
    if (!value && value !== 0) return [];
    const base = Array.isArray(value) ? value : [value];
    return base
      .flatMap((entry) => String(entry).split(','))
      .map((entry) => entry.trim())
      .filter(Boolean);
  };

  const singleValue = (value) => {
    if (value === undefined || value === null) return undefined;
    return Array.isArray(value) ? value[0] : value;
  };

  const filters = [];
  const params = { limit, offset };

  const stackIds = valueToArray(req.query.stackIds ?? req.query.stackId);
  if (stackIds.length) {
    const placeholders = stackIds.map((_, idx) => `@stackId${idx}`);
    filters.push(`stack_id IN (${placeholders.join(', ')})`);
    stackIds.forEach((stack, idx) => {
      params[`stackId${idx}`] = stack;
    });
  }

  const statuses = valueToArray(req.query.statuses ?? req.query.status);
  if (statuses.length) {
    const placeholders = statuses.map((_, idx) => `@status${idx}`);
    filters.push(`status IN (${placeholders.join(', ')})`);
    statuses.forEach((entry, idx) => {
      params[`status${idx}`] = entry;
    });
  }

  const endpoints = valueToArray(req.query.endpoints ?? req.query.endpoint);
  if (endpoints.length) {
    const placeholders = endpoints.map((_, idx) => `@endpoint${idx}`);
    filters.push(`endpoint IN (${placeholders.join(', ')})`);
    endpoints.forEach((entry, idx) => {
      const numeric = Number(entry);
      params[`endpoint${idx}`] = Number.isNaN(numeric) ? entry : numeric;
    });
  }

  const messageQuery = singleValue(req.query.message);
  if (messageQuery && String(messageQuery).trim()) {
    filters.push('message LIKE @message');
    params.message = `%${String(messageQuery).trim()}%`;
  }

  const from = singleValue(req.query.from);
  if (from) {
    filters.push('timestamp >= @from');
    params.from = from;
  }

  const to = singleValue(req.query.to);
  if (to) {
    filters.push('timestamp <= @to');
    params.to = to;
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const query = `
    SELECT
      id,
      timestamp,
      stack_id AS stackId,
      stack_name AS stackName,
      status,
      message,
      endpoint
    FROM redeploy_logs
    ${whereClause}
    ORDER BY datetime(timestamp) DESC
    LIMIT @limit OFFSET @offset
  `;

  try {
    const stmt = db.prepare(query);
    const logs = stmt.all(params);
    res.json(logs);
  } catch (err) {
    console.error('❌ Fehler beim Abrufen der Redeploy-Logs:', err.message);
    if (err.message.includes('no such table')) {
      return res.status(500).json({ error: 'redeploy_logs table nicht gefunden. Bitte Migration ausführen.' });
    }
    res.status(500).json({ error: 'Fehler beim Abrufen der Redeploy-Logs' });
  }
});

// Einzel-Redeploy
app.put('/api/stacks/:id/redeploy', async (req, res) => {
  const { id } = req.params;
  console.log(`🔄 PUT /api/stacks/${id}/redeploy: Redeploy gestartet`);

  let stack;
  try {
    broadcastRedeployStatus(id, true);

    const stackRes = await axiosInstance.get(`/api/stacks/${id}`);
    stack = stackRes.data;

    if (stack.EndpointId !== ENDPOINT_ID) {
      throw new Error(`Stack gehört nicht zum Endpoint ${ENDPOINT_ID}`);
    }

    logRedeployEvent({
      stackId: stack.Id || id,
      stackName: stack.Name,
      status: 'started',
      message: 'Redeploy gestartet',
      endpoint: stack.EndpointId
    });

    if (stack.Type === 1) {
      console.log(`🔄 [Redeploy] Git Stack "${stack.Name}" (${id}) wird redeployed`);
      await axiosInstance.put(`/api/stacks/${id}/git/redeploy?endpointId=${stack.EndpointId}`);
    } else if (stack.Type === 2) {
      console.log(`🔄 [Redeploy] Compose Stack "${stack.Name}" (${id}) wird redeployed`);
      const fileRes = await axiosInstance.get(`/api/stacks/${id}/file`);
      const stackFileContent = fileRes.data?.StackFileContent;
      if (!stackFileContent) throw new Error("Stack file konnte nicht geladen werden");

      const services = fileRes.data?.Config?.services || {};
      for (const serviceName in services) {
        const imageName = services[serviceName].image;
        if (!imageName) continue;
        try {
          console.log(`🖼️ Pulling image "${imageName}" für Service "${serviceName}"`);
          await axiosInstance.post(
            `/api/endpoints/${stack.EndpointId}/docker/images/create?fromImage=${encodeURIComponent(imageName)}`
          );
        } catch (err) {
          console.error(`❌ Fehler beim Pulling von Image "${imageName}":`, err.message);
        }
      }

      await axiosInstance.put(`/api/stacks/${id}`,
        { StackFileContent: stackFileContent, Prune: false, PullImage: true },
        { params: { endpointId: stack.EndpointId } }
      );
    }

    broadcastRedeployStatus(id, false);
    logRedeployEvent({
      stackId: stack.Id || id,
      stackName: stack.Name,
      status: 'success',
      message: 'Redeploy erfolgreich abgeschlossen',
      endpoint: stack.EndpointId
    });
    console.log(`✅ PUT /api/stacks/${id}/redeploy: Redeploy erfolgreich abgeschlossen`);
    res.json({ success: true, message: 'Stack redeployed' });
  } catch (err) {
    broadcastRedeployStatus(id, false);
    const errorMessage = err.response?.data?.message || err.message;
    logRedeployEvent({
      stackId: stack?.Id || id,
      stackName: stack?.Name || `Stack ${id}`,
      status: 'error',
      message: errorMessage,
      endpoint: stack?.EndpointId || ENDPOINT_ID
    });
    console.error(`❌ Fehler beim Redeploy von Stack ${id}:`, errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

// Redeploy ALL
app.put('/api/stacks/redeploy-all', async (req, res) => {
  console.log(`🚀 PUT /api/stacks/redeploy-all: Redeploy ALL gestartet`);

  try {
    const stacksRes = await axiosInstance.get('/api/stacks');
    const filteredStacks = stacksRes.data.filter(stack => stack.EndpointId === ENDPOINT_ID);

    console.log("📦 Redeploy ALL für folgende Stacks:");
    filteredStacks.forEach(s => console.log(`   - ${s.Name}`));

    filteredStacks.forEach(async (stack) => {
      try {
        broadcastRedeployStatus(stack.Id, true);
        logRedeployEvent({
          stackId: stack.Id,
          stackName: stack.Name,
          status: 'started',
          message: 'Redeploy über Redeploy ALL gestartet',
          endpoint: stack.EndpointId
        });

        if (stack.Type === 1) {
          console.log(`🔄 [Redeploy] Git Stack "${stack.Name}" (${stack.Id})`);
          await axiosInstance.put(`/api/stacks/${stack.Id}/git/redeploy?endpointId=${stack.EndpointId}`);
        } else if (stack.Type === 2) {
          console.log(`🔄 [Redeploy] Compose Stack "${stack.Name}" (${stack.Id})`);
          const fileRes = await axiosInstance.get(`/api/stacks/${stack.Id}/file`);
          const stackFileContent = fileRes.data?.StackFileContent;
          if (stackFileContent) {
            await axiosInstance.put(`/api/stacks/${stack.Id}`,
              { StackFileContent: stackFileContent, Prune: false, PullImage: true },
              { params: { endpointId: stack.EndpointId } }
            );
          }
        }

        broadcastRedeployStatus(stack.Id, false);
        logRedeployEvent({
          stackId: stack.Id,
          stackName: stack.Name,
          status: 'success',
          message: 'Redeploy über Redeploy ALL abgeschlossen',
          endpoint: stack.EndpointId
        });
        console.log(`✅ Redeploy abgeschlossen: ${stack.Name}`);
      } catch (err) {
        broadcastRedeployStatus(stack.Id, false);
        const errorMessage = err.response?.data?.message || err.message;
        logRedeployEvent({
          stackId: stack.Id,
          stackName: stack.Name,
          status: 'error',
          message: errorMessage,
          endpoint: stack.EndpointId
        });
        console.error(`❌ Fehler beim Redeploy von Stack ${stack.Name}:`, errorMessage);
      }
    });

    res.json({ success: true, message: 'Redeploy ALL gestartet' });
  } catch (err) {
    console.error(`❌ Fehler beim Redeploy ALL:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend läuft auf Port ${PORT}`);
});
