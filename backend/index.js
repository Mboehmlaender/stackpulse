import express from 'express';
import dotenv from 'dotenv';
import https from 'https';
import axios from 'axios';
import http from 'http';
import { Server } from 'socket.io';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 4000;

// HTTPS Agent für Self-Signed-Zertifikate
const agent = new https.Agent({ rejectUnauthorized: false });

// Axios-Instance für alle Portainer-Requests
const axiosInstance = axios.create({
  httpsAgent: agent,
  headers: { "X-API-Key": process.env.PORTAINER_API_KEY },
  baseURL: process.env.PORTAINER_URL,
});

// In-Memory Store für Redeploy-Status
const redeployingStacks = {}; // { [stackId]: true/false }

// HTTP Server + Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // ggf. auf Frontend-URL anpassen
});

// Socket.IO Verbindung
io.on("connection", (socket) => {
  console.log("Client verbunden:", socket.id);
});

// Hilfsfunktion zum Broadcasten des Redeploy-Status
const broadcastRedeployStatus = (stackId, status) => {
  redeployingStacks[stackId] = status;
  io.emit("redeployStatus", { stackId, status });
  console.log(`Stack ${stackId} redeploying: ${status}`);
};

// Root-Endpoint
app.get('/', (req, res) => {
  console.log("Root Endpoint aufgerufen");
  res.send('StackPulse Backend läuft. Nutze /api/stacks für die Daten.');
});

// Alle Stacks abrufen
app.get('/api/stacks', async (req, res) => {
  try {
    const stacksRes = await axiosInstance.get('/api/stacks');

    const stacksWithStatus = await Promise.all(
      stacksRes.data.map(async (stack) => {
        try {
          const statusRes = await axiosInstance.get(`/api/stacks/${stack.Id}/images_status?refresh=true`);
          let statusEmoji = '✅'; // up-to-date
          if (statusRes.data.Status === 'outdated') statusEmoji = '⚠️'; // outdated

          return {
            ...stack,
            updateStatus: statusEmoji,
            redeploying: redeployingStacks[stack.Id] || false,
          };
        } catch (err) {
          console.error(`Fehler beim Abrufen Remote Digest für Stack ${stack.Id}:`, err.message);
          return {
            ...stack,
            updateStatus: '❌', // Fehler
            redeploying: redeployingStacks[stack.Id] || false,
          };
        }
      })
    );

    stacksWithStatus.sort((a, b) => a.Name.localeCompare(b.Name));
    res.json(stacksWithStatus);
  } catch (err) {
    console.error('Fehler beim Abrufen der Stacks:', err.message);
    if (err.response) res.status(err.response.status).json(err.response.data);
    else res.status(500).json({ error: err.message });
  }
});

// Redeploy eines Stacks
app.put('/api/stacks/:id/redeploy', async (req, res) => {
  const { id } = req.params;

  try {
    // Status auf "redeploying" setzen & an alle Clients senden
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
        } catch (pullErr) {
          console.error(`Fehler beim Pull von ${imageName}:`, pullErr.message);
        }
      }

      await axiosInstance.put(
        `/api/stacks/${id}`,
        { StackFileContent: stackFileContent, Prune: false, PullImage: true },
        { params: { endpointId: stack.EndpointId } }
      );
    }

    // Redeploy beendet, Status an alle Clients senden
    broadcastRedeployStatus(id, false);

    res.json({ success: true, message: 'Stack redeployed' });
  } catch (err) {
    // Fehler → Status zurücksetzen & an Clients senden
    broadcastRedeployStatus(id, false);
    console.error(`Fehler beim Redeploy von Stack ${id}:`, err.message);
    if (err.response) res.status(err.response.status).json(err.response.data);
    else res.status(500).json({ error: err.message });
  }
});

// Server starten
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend läuft auf Port ${PORT}`);
});
