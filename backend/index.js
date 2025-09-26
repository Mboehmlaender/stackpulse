import express from 'express';
import dotenv from 'dotenv';
import https from 'https';
import axios from 'axios';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

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
const io = new Server(server, { cors: { origin: "*" } });

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

// Einzel-Redeploy
app.put('/api/stacks/:id/redeploy', async (req, res) => {
  const { id } = req.params;
  console.log(`🔄 PUT /api/stacks/${id}/redeploy: Redeploy gestartet`);

  try {
    broadcastRedeployStatus(id, true);

    const stackRes = await axiosInstance.get(`/api/stacks/${id}`);
    const stack = stackRes.data;

    if (stack.EndpointId !== ENDPOINT_ID) {
      throw new Error(`Stack gehört nicht zum Endpoint ${ENDPOINT_ID}`);
    }

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
    console.log(`✅ PUT /api/stacks/${id}/redeploy: Redeploy erfolgreich abgeschlossen`);
    res.json({ success: true, message: 'Stack redeployed' });
  } catch (err) {
    broadcastRedeployStatus(id, false);
    console.error(`❌ Fehler beim Redeploy von Stack ${id}:`, err.message);
    res.status(500).json({ error: err.message });
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
        console.log(`✅ Redeploy abgeschlossen: ${stack.Name}`);
      } catch (err) {
        broadcastRedeployStatus(stack.Id, false);
        console.error(`❌ Fehler beim Redeploy von Stack ${stack.Name}:`, err.message);
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
