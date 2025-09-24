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

// Statische Frontend-Dateien ausliefern
app.use(express.static(path.join(__dirname, 'public')));

// SPA-Fallback für React-Router
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Backend-Port fix
const PORT = 4001;

// HTTPS Agent für Self-Signed-Zertifikate
const agent = new https.Agent({ rejectUnauthorized: false });

// Axios-Instance für Portainer
const axiosInstance = axios.create({
  httpsAgent: agent,
  headers: { "X-API-Key": process.env.PORTAINER_API_KEY },
  baseURL: process.env.PORTAINER_URL,
});

// In-Memory Redeploy-Status
const redeployingStacks = {};

// HTTP Server + Socket.IO
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("Client verbunden:", socket.id);
});

const broadcastRedeployStatus = (stackId, status) => {
  redeployingStacks[stackId] = status;
  io.emit("redeployStatus", { stackId, status });
};

// --- API Endpoints ---
app.get('/api/stacks', async (req, res) => {
  try {
    const stacksRes = await axiosInstance.get('/api/stacks');
    const stacksWithStatus = await Promise.all(
      stacksRes.data.map(async (stack) => {
        try {
          const statusRes = await axiosInstance.get(
            `/api/stacks/${stack.Id}/images_status?refresh=true`
          );
          let statusEmoji = statusRes.data.Status === 'outdated' ? '⚠️' : '✅';
          return { ...stack, updateStatus: statusEmoji, redeploying: redeployingStacks[stack.Id] || false };
        } catch {
          return { ...stack, updateStatus: '❌', redeploying: redeployingStacks[stack.Id] || false };
        }
      })
    );
    stacksWithStatus.sort((a, b) => a.Name.localeCompare(b.Name));
    res.json(stacksWithStatus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/stacks/:id/redeploy', async (req, res) => {
  const { id } = req.params;
  try {
    broadcastRedeployStatus(id, true);

    const stackRes = await axiosInstance.get(`/api/stacks/${id}`);
    const stack = stackRes.data;

    if (stack.Type === 1) {
      await axiosInstance.put(`/api/stacks/${id}/git/redeploy?endpointId=${stack.EndpointId}`);
    } else if (stack.Type === 2) {
      const fileRes = await axiosInstance.get(`/api/stacks/${id}/file`);
      const stackFileContent = fileRes.data?.StackFileContent;
      if (!stackFileContent) throw new Error("Stack file konnte nicht geladen werden");

      const services = fileRes.data?.Config?.services || {};
      for (const serviceName in services) {
        const imageName = services[serviceName].image;
        if (!imageName) continue;
        try {
          await axiosInstance.post(
            `/api/endpoints/${stack.EndpointId}/docker/images/create?fromImage=${encodeURIComponent(imageName)}`
          );
        } catch {}
      }

      await axiosInstance.put(`/api/stacks/${id}`,
        { StackFileContent: stackFileContent, Prune: false, PullImage: true },
        { params: { endpointId: stack.EndpointId } }
      );
    }

    broadcastRedeployStatus(id, false);
    res.json({ success: true, message: 'Stack redeployed' });
  } catch (err) {
    broadcastRedeployStatus(id, false);
    res.status(500).json({ error: err.message });
  }
});

// Server starten
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend läuft auf Port ${PORT}`);
});
