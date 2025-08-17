import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;
const PORTAINER_URL = process.env.PORTAINER_URL;
const PORTAINER_API_KEY = process.env.PORTAINER_API_KEY;

console.log("PORTAINER_API_KEY:", PORTAINER_API_KEY);

// Root-Endpoint
app.get('/', (req, res) => {
  res.send('StackPulse Backend läuft. Nutze /api/stacks für die Daten.');
});

// Alle Stacks abrufen und Status prüfen
app.get('/api/stacks', async (req, res) => {
  try {
    const stacksRes = await axios.get(`${PORTAINER_URL}/api/stacks`, {
      headers: { 'X-API-Key': PORTAINER_API_KEY }
    });

    const stacksWithStatus = await Promise.all(
      stacksRes.data.map(async (stack) => {
        try {
          const statusRes = await axios.get(
            `${PORTAINER_URL}/api/stacks/${stack.Id}/images_status?refresh=true`,
            { headers: { 'X-API-Key': PORTAINER_API_KEY } }
          );

          let statusEmoji = '✅';
          if (statusRes.data.Status === 'outdated') statusEmoji = '⚠️';

          return { ...stack, updateStatus: statusEmoji };
        } catch (err) {
          console.error(`Fehler beim Abrufen Remote Digest für Stack ${stack.Id}:`, err.message);
          return { ...stack, updateStatus: '❌' };
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

// Redeploy eines Stacks (alle Typen)
app.put('/api/stacks/:id/redeploy', async (req, res) => {
  const { id } = req.params;

  try {
    const stackRes = await axios.get(`${PORTAINER_URL}/api/stacks/${id}`, {
      headers: { 'X-API-Key': PORTAINER_API_KEY }
    });
    const stack = stackRes.data;

    if (stack.Type === 1) {
      await axios.put(
        `${PORTAINER_URL}/api/stacks/${id}/git/redeploy?endpointId=${stack.EndpointId}`,
        {},
        { headers: { 'X-API-Key': PORTAINER_API_KEY } }
      );
      return res.json({ success: true, message: 'Git Stack redeployed' });

    } else if (stack.Type === 2) {
      const fileRes = await axios.get(`${PORTAINER_URL}/api/stacks/${id}/file`, {
        headers: { 'X-API-Key': PORTAINER_API_KEY }
      });

      const stackFileContent = fileRes.data?.StackFileContent;
      if (!stackFileContent) return res.status(500).json({ error: 'Stack file konnte nicht geladen werden' });

      const services = fileRes.data?.Config?.services || {};
      for (const serviceName in services) {
        const imageName = services[serviceName].image;
        if (!imageName) continue;
        try {
          await axios.post(
            `${PORTAINER_URL}/api/endpoints/${stack.EndpointId}/docker/images/create?fromImage=${encodeURIComponent(imageName)}`,
            {},
            { headers: { 'X-API-Key': PORTAINER_API_KEY } }
          );
        } catch (pullErr) {
          console.error(`Fehler beim Pull von ${imageName}:`, pullErr.message);
        }
      }

      await axios.put(
        `${PORTAINER_URL}/api/stacks/${id}?endpointId=${stack.EndpointId}`,
        {
          StackFileContent: stackFileContent,
          Prune: false,
          PullImage: true
        },
        { headers: { 'X-API-Key': PORTAINER_API_KEY } }
      );

      return res.json({ success: true, message: 'Compose/Local Stack redeployed' });

    } else {
      return res.status(400).json({ error: 'Unbekannter oder noch nicht unterstützter Stack-Typ' });
    }
  } catch (err) {
    console.error('Redeploy fehlgeschlagen:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ success: false, error: err.message });
  }
});


app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend läuft auf http://0.0.0.0:${PORT}`);
});
