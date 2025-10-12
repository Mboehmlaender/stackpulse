import express from 'express';
import dotenv from 'dotenv';
import https from 'https';
import axios from 'axios';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db/index.js';
import {
  logRedeployEvent,
  buildLogFilter,
  deleteLogById,
  deleteLogsByFilters,
  exportLogsByFilters
} from './db/redeployLogs.js';

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

const REDEPLOY_STATUS = {
  IDLE: 'idle',
  QUEUED: 'queued',
  RUNNING: 'running'
};

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
  if (!status || status === REDEPLOY_STATUS.IDLE) {
    delete redeployingStacks[stackId];
  } else {
    redeployingStacks[stackId] = status;
  }

  const payloadStatus = status || REDEPLOY_STATUS.IDLE;
  io.emit("redeployStatus", { stackId, status: payloadStatus });

  let statusText = 'fertig';
  if (payloadStatus === REDEPLOY_STATUS.RUNNING) {
    statusText = 'im Redeploy';
  } else if (payloadStatus === REDEPLOY_STATUS.QUEUED) {
    statusText = 'in der Warteschlange';
  }
  console.log(`🔄 [RedeployStatus] Stack ${stackId} ist jetzt ${statusText}`);
};

const REDEPLOY_TYPES = {
  SINGLE: 'Einzeln',
  ALL: 'Alle',
  SELECTION: 'Auswahl'
};

const SELF_STACK_ID = process.env.SELF_STACK_ID ? String(process.env.SELF_STACK_ID) : null;

const isStackOutdated = async (stackId) => {
  try {
    const statusRes = await axiosInstance.get(`/api/stacks/${stackId}/images_status?refresh=true`);
    return statusRes.data?.Status === 'outdated';
  } catch (err) {
    console.error(`⚠️ Konnte Update-Status für Stack ${stackId} nicht ermitteln:`, err.message);
    return true;
  }
};

const filterOutdatedStacks = async (stacks = []) => {
  const results = await Promise.all(
    stacks.map(async (stack) => ({
      stack,
      outdated: SELF_STACK_ID && String(stack.Id) === SELF_STACK_ID
        ? false
        : await isStackOutdated(stack.Id)
    }))
  );

  return {
    eligibleStacks: results.filter((entry) => entry.outdated).map((entry) => entry.stack),
    skippedStacks: results.filter((entry) => !entry.outdated).map((entry) => entry.stack),
  };
};

// --- API Endpoints ---

// Stacks abrufen
app.get('/api/stacks', async (req, res) => {
  console.log("ℹ️ [API] GET /api/stacks: Abruf gestartet");
  try {
    const stacksRes = await axiosInstance.get('/api/stacks');
    const filteredStacks = stacksRes.data.filter(stack => stack.EndpointId === ENDPOINT_ID);

    const stacksByName = new Map();
    const duplicateNames = new Set();

    filteredStacks.forEach(stack => {
      const name = stack.Name;
      const isSelf = SELF_STACK_ID && String(stack.Id) === SELF_STACK_ID;
      const existingEntry = stacksByName.get(name);

      if (!existingEntry) {
        stacksByName.set(name, { stack, isSelf });
        return;
      }

      duplicateNames.add(name);

      if (!existingEntry.isSelf && isSelf) {
        stacksByName.set(name, { stack, isSelf });
      }
    });

    const uniqueStacks = Array.from(stacksByName.values()).map(entry => entry.stack);

    if (duplicateNames.size) {
      console.warn(`⚠️ [API] GET /api/stacks: Doppelte Stack-Namen erkannt: ${Array.from(duplicateNames).join(', ')}`);
    }

    const stacksWithStatus = await Promise.all(
      uniqueStacks.map(async (stack) => {
        const redeployState = redeployingStacks[stack.Id] || REDEPLOY_STATUS.IDLE;
        const redeployCommon = {
          redeployState,
          redeploying: redeployState === REDEPLOY_STATUS.RUNNING,
          redeployQueued: redeployState === REDEPLOY_STATUS.QUEUED,
          redeployDisabled: SELF_STACK_ID ? String(stack.Id) === SELF_STACK_ID : false
        };

        try {
          const statusRes = await axiosInstance.get(
            `/api/stacks/${stack.Id}/images_status?refresh=true`
          );
          const statusEmoji = statusRes.data.Status === 'outdated' ? '⚠️' : '✅';
          return {
            ...stack,
            updateStatus: statusEmoji,
            ...redeployCommon
          };
        } catch (err) {
          console.error(`❌ Fehler beim Abrufen des Status für Stack ${stack.Id}:`, err.message);
          return {
            ...stack,
            updateStatus: '❌',
            ...redeployCommon
          };
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
  const perPageParam = req.query.perPage ?? req.query.limit;
  const perPage = perPageParam === 'all' ? 'all' : Math.min(parseInt(perPageParam, 10) || 50, 500);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  const limit = perPage === 'all' ? undefined : perPage;
  const offset = perPage === 'all' ? 0 : (page - 1) * perPage;

  const { whereClause, params } = buildLogFilter(req.query);
  const baseQuery = `
    SELECT
      id,
      timestamp,
      stack_id AS stackId,
      stack_name AS stackName,
      status,
      message,
      endpoint,
      redeploy_type AS redeployType
    FROM redeploy_logs
    ${whereClause}
    ORDER BY datetime(timestamp) DESC
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM redeploy_logs
    ${whereClause}
  `;

  const query = limit !== undefined
    ? `${baseQuery} LIMIT @limit OFFSET @offset`
    : baseQuery;

  if (limit !== undefined) {
    params.limit = limit;
    params.offset = offset;
  }

  try {
    const stmt = db.prepare(query);
    const logs = stmt.all(params);
    const total = db.prepare(countQuery).get(params)?.total ?? logs.length;

    res.json({
      total,
      items: logs,
      page,
      perPage: perPage === 'all' ? 'all' : limit
    });
  } catch (err) {
    console.error('❌ Fehler beim Abrufen der Redeploy-Logs:', err.message);
    if (err.message.includes('no such table')) {
      return res.status(500).json({ error: 'redeploy_logs table nicht gefunden. Bitte Migration ausführen.' });
    }
    res.status(500).json({ error: 'Fehler beim Abrufen der Redeploy-Logs' });
  }
});

app.delete('/api/logs/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Ungültige ID' });
  }

  try {
    const changes = deleteLogById(id);
    if (!changes) {
      return res.status(404).json({ error: 'Eintrag nicht gefunden' });
    }
    res.json({ success: true, deleted: changes });
  } catch (err) {
    console.error('❌ Fehler beim Löschen des Redeploy-Logs:', err.message);
    res.status(500).json({ error: 'Fehler beim Löschen des Redeploy-Logs' });
  }
});

app.delete('/api/logs', (req, res) => {
  try {
    const deleted = deleteLogsByFilters(req.query);
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('❌ Fehler beim Löschen der Redeploy-Logs:', err.message);
    res.status(500).json({ error: 'Fehler beim Löschen der Redeploy-Logs' });
  }
});

app.get('/api/logs/export', (req, res) => {
  const format = (req.query.format || 'txt').toLowerCase();
  if (!['txt', 'sql'].includes(format)) {
    return res.status(400).json({ error: 'Ungültiges Export-Format' });
  }

  try {
    const payload = exportLogsByFilters(req.query, format);
    res.setHeader('Content-Type', payload.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
    res.send(payload.content);
  } catch (err) {
    console.error('❌ Fehler beim Export der Redeploy-Logs:', err.message);
    res.status(500).json({ error: 'Fehler beim Export der Redeploy-Logs' });
  }
});

// Einzel-Redeploy
app.put('/api/stacks/:id/redeploy', async (req, res) => {
  const { id } = req.params;
  console.log(`🔄 PUT /api/stacks/${id}/redeploy: Redeploy gestartet`);

  let stack;
  try {
    broadcastRedeployStatus(id, REDEPLOY_STATUS.RUNNING);

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
      endpoint: stack.EndpointId,
      redeployType: REDEPLOY_TYPES.SINGLE
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

    broadcastRedeployStatus(id, REDEPLOY_STATUS.IDLE);
    logRedeployEvent({
      stackId: stack.Id || id,
      stackName: stack.Name,
      status: 'success',
      message: 'Redeploy erfolgreich abgeschlossen',
      endpoint: stack.EndpointId,
      redeployType: REDEPLOY_TYPES.SINGLE
    });
    console.log(`✅ PUT /api/stacks/${id}/redeploy: Redeploy erfolgreich abgeschlossen`);
    res.json({ success: true, message: 'Stack redeployed' });
  } catch (err) {
    broadcastRedeployStatus(id, REDEPLOY_STATUS.IDLE);
    const errorMessage = err.response?.data?.message || err.message;
    logRedeployEvent({
      stackId: stack?.Id || id,
      stackName: stack?.Name || `Stack ${id}`,
      status: 'error',
      message: errorMessage,
      endpoint: stack?.EndpointId || ENDPOINT_ID,
      redeployType: REDEPLOY_TYPES.SINGLE
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

    const { eligibleStacks, skippedStacks } = await filterOutdatedStacks(filteredStacks);

    if (skippedStacks.length) {
      skippedStacks.forEach((stack) => {
        console.log(`⏭️ Übersprungen (aktuell): ${stack.Name} (${stack.Id})`);
      });
    }

    const stackSummaryList = eligibleStacks.map((stack) => `${stack.Name} (${stack.Id})`);
    const stackSummary = stackSummaryList.length ? stackSummaryList.join(', ') : 'keine Stacks';
    logRedeployEvent({
      stackId: '---',
      stackName: '---',
      status: 'started',
      message: `Redeploy ALL gestartet für: ${stackSummary}`,
      endpoint: ENDPOINT_ID,
      redeployType: REDEPLOY_TYPES.ALL
    });

    if (!eligibleStacks.length) {
      logRedeployEvent({
        stackId: '---',
        stackName: '---',
        status: 'success',
        message: 'Redeploy ALL übersprungen: keine veralteten Stacks',
        endpoint: ENDPOINT_ID,
        redeployType: REDEPLOY_TYPES.ALL
      });
      return res.json({ success: true, message: 'Keine veralteten Stacks für Redeploy ALL' });
    }

    eligibleStacks.forEach((stack) => {
      broadcastRedeployStatus(stack.Id, REDEPLOY_STATUS.QUEUED);
    });

    for (const stack of eligibleStacks) {
      try {
        broadcastRedeployStatus(stack.Id, REDEPLOY_STATUS.RUNNING);
        logRedeployEvent({
          stackId: stack.Id,
          stackName: stack.Name,
          status: 'started',
          message: 'Redeploy ALL gestartet',
          endpoint: stack.EndpointId,
          redeployType: REDEPLOY_TYPES.ALL
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

        broadcastRedeployStatus(stack.Id, REDEPLOY_STATUS.IDLE);
        logRedeployEvent({
          stackId: stack.Id,
          stackName: stack.Name,
          status: 'success',
          message: 'Redeploy ALL abgeschlossen',
          endpoint: stack.EndpointId,
          redeployType: REDEPLOY_TYPES.ALL
        });
        console.log(`✅ Redeploy abgeschlossen: ${stack.Name}`);
      } catch (err) {
        broadcastRedeployStatus(stack.Id, REDEPLOY_STATUS.IDLE);
        const errorMessage = err.response?.data?.message || err.message;
        logRedeployEvent({
          stackId: stack.Id,
          stackName: stack.Name,
          status: 'error',
          message: errorMessage,
          endpoint: stack.EndpointId,
          redeployType: REDEPLOY_TYPES.ALL
        });
        console.error(`❌ Fehler beim Redeploy von Stack ${stack.Name}:`, errorMessage);
      }
    }

    res.json({ success: true, message: 'Redeploy ALL gestartet' });
  } catch (err) {
    console.error(`❌ Fehler beim Redeploy ALL:`, err.message);
    logRedeployEvent({
      stackId: '---',
      stackName: '---',
      status: 'error',
      message: err.message,
      endpoint: ENDPOINT_ID,
      redeployType: REDEPLOY_TYPES.ALL
    });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/stacks/redeploy-selection', async (req, res) => {
  const { stackIds } = req.body || {};
  console.log(`🚀 PUT /api/stacks/redeploy-selection: Redeploy Auswahl gestartet (${Array.isArray(stackIds) ? stackIds.length : 0} Stacks)`);

  if (!Array.isArray(stackIds) || !stackIds.length) {
    return res.status(400).json({ error: 'stackIds (array) erforderlich' });
  }

  const normalizedIds = stackIds.map((id) => String(id));

  try {
    const stacksRes = await axiosInstance.get('/api/stacks');
    const endpointStacks = stacksRes.data.filter(stack => stack.EndpointId === ENDPOINT_ID);
    const selectedStacks = endpointStacks.filter((stack) => normalizedIds.includes(String(stack.Id)));

    if (!selectedStacks.length) {
      return res.status(400).json({ error: 'Keine gültigen Stacks für Redeploy Auswahl gefunden' });
    }

    const missingIds = normalizedIds.filter((id) => !selectedStacks.some((stack) => String(stack.Id) === id));
    if (missingIds.length) {
      return res.status(400).json({ error: `Ungültige Stack-IDs: ${missingIds.join(', ')}` });
    }

    const { eligibleStacks, skippedStacks } = await filterOutdatedStacks(selectedStacks);

    if (skippedStacks.length) {
      skippedStacks.forEach((stack) => {
        console.log(`⏭️ Übersprungen (aktuell): ${stack.Name} (${stack.Id})`);
      });
    }

    const stackSummaryList = eligibleStacks.map((stack) => `${stack.Name} (${stack.Id})`);
    const stackSummary = stackSummaryList.length ? stackSummaryList.join(', ') : 'keine Stacks';
    logRedeployEvent({
      stackId: '---',
      stackName: '---',
      status: 'started',
      message: `Redeploy Auswahl gestartet für: ${stackSummary}`,
      endpoint: ENDPOINT_ID,
      redeployType: REDEPLOY_TYPES.SELECTION
    });

    if (!eligibleStacks.length) {
      logRedeployEvent({
        stackId: '---',
        stackName: '---',
        status: 'success',
        message: 'Redeploy Auswahl übersprungen: keine veralteten Stacks',
        endpoint: ENDPOINT_ID,
        redeployType: REDEPLOY_TYPES.SELECTION
      });
      return res.json({ success: true, message: 'Keine veralteten Stacks in der Auswahl' });
    }

    eligibleStacks.forEach((stack) => {
      broadcastRedeployStatus(stack.Id, REDEPLOY_STATUS.QUEUED);
    });

    for (const stack of eligibleStacks) {
      try {
        broadcastRedeployStatus(stack.Id, REDEPLOY_STATUS.RUNNING);
        logRedeployEvent({
          stackId: stack.Id,
          stackName: stack.Name,
          status: 'started',
          message: 'Redeploy Auswahl gestartet',
          endpoint: stack.EndpointId,
          redeployType: REDEPLOY_TYPES.SELECTION
        });

        if (stack.Type === 1) {
          console.log(`🔄 [Redeploy Auswahl] Git Stack "${stack.Name}" (${stack.Id})`);
          await axiosInstance.put(`/api/stacks/${stack.Id}/git/redeploy?endpointId=${stack.EndpointId}`);
        } else if (stack.Type === 2) {
          console.log(`🔄 [Redeploy Auswahl] Compose Stack "${stack.Name}" (${stack.Id})`);
          const fileRes = await axiosInstance.get(`/api/stacks/${stack.Id}/file`);
          const stackFileContent = fileRes.data?.StackFileContent;
          if (stackFileContent) {
            await axiosInstance.put(`/api/stacks/${stack.Id}`,
              { StackFileContent: stackFileContent, Prune: false, PullImage: true },
              { params: { endpointId: stack.EndpointId } }
            );
          }
        }

        broadcastRedeployStatus(stack.Id, REDEPLOY_STATUS.IDLE);
        logRedeployEvent({
          stackId: stack.Id,
          stackName: stack.Name,
          status: 'success',
          message: 'Redeploy Auswahl erfolgreich abgeschlossen',
          endpoint: stack.EndpointId,
          redeployType: REDEPLOY_TYPES.SELECTION
        });
        console.log(`✅ Redeploy Auswahl abgeschlossen: ${stack.Name}`);
      } catch (err) {
        broadcastRedeployStatus(stack.Id, REDEPLOY_STATUS.IDLE);
        const errorMessage = err.response?.data?.message || err.message;
        logRedeployEvent({
          stackId: stack.Id,
          stackName: stack.Name,
          status: 'error',
          message: errorMessage,
          endpoint: stack.EndpointId,
          redeployType: REDEPLOY_TYPES.SELECTION
        });
        console.error(`❌ Fehler beim Redeploy Auswahl für Stack ${stack.Name}:`, errorMessage);
      }
    }

    res.json({ success: true, message: 'Redeploy Auswahl gestartet' });
  } catch (err) {
    const errorMessage = err.response?.data?.message || err.message;
    console.error(`❌ Fehler beim Redeploy Auswahl:`, errorMessage);
    logRedeployEvent({
      stackId: '---',
      stackName: '---',
      status: 'error',
      message: errorMessage,
      endpoint: ENDPOINT_ID,
      redeployType: REDEPLOY_TYPES.SELECTION
    });
    res.status(500).json({ error: errorMessage });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend läuft auf Port ${PORT}`);
});
