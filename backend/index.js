import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const PORTAINER_URL = process.env.PORTAINER_URL;
const PORTAINER_API_KEY = process.env.PORTAINER_API_KEY;

console.log("PORTAINER_API_KEY:", PORTAINER_API_KEY);

// Root-Endpoint
app.get('/', (req, res) => {
  res.send('StackPulse Backend läuft. Nutze /api/stacks für die Daten.');
});

app.get('/api/stacks', async (req, res) => {
  try {
    // 1. Alle Stacks abrufen
    const stacksUrl = `${PORTAINER_URL}/api/stacks`;
    const stacksRes = await axios.get(stacksUrl, {
      headers: { 'X-API-Key': PORTAINER_API_KEY }
    });

    const stacksWithStatus = await Promise.all(
      stacksRes.data.map(async (stack) => {
        try {
          // 2. Für jeden Stack den Image-Status abrufen
          const statusUrl = `${PORTAINER_URL}/api/stacks/${stack.Id}/images_status?refresh=true`;
          const statusRes = await axios.get(statusUrl, {
            headers: { 'X-API-Key': PORTAINER_API_KEY }
          });

          // 3. Status prüfen und Emoji setzen
          let statusEmoji = '✅'; // Standard: aktuell
          if (statusRes.data.Status === 'outdated') {
            statusEmoji = '⚠️';
          }

          return {
            ...stack,
            updateStatus: statusEmoji
          };
        } catch (err) {
          console.error(`Fehler beim Abrufen Remote Digest für Stack ${stack.Id}:`, err.message);
          return { ...stack, updateStatus: '❌' };
        }
      })
    );

    // 4. Alphabetisch nach Name sortieren
    stacksWithStatus.sort((a, b) => a.Name.localeCompare(b.Name));

    res.json(stacksWithStatus);
  } catch (err) {
    console.error('Fehler beim Abrufen der Stacks:', err.message);
    if (err.response) {
      res.status(err.response.status).json(err.response.data);
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend läuft auf http://0.0.0.0:${PORT}`);
});
