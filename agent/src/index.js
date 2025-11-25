const express = require('express');
const Docker = require('dockerode');

const infoRoutes = require('./routes/info');
const containerRoutes = require('./routes/containers');
const imageRoutes = require('./routes/images');
const stackRoutes = require('./routes/stacks');
const portainerRoutes = require('./routes/portainer');

const AGENT_PORT = parseInt(process.env.AGENT_PORT || '7070', 10);
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';

const app = express();
const docker = new Docker({ socketPath: DOCKER_SOCKET });

app.use(express.json());

if (!AGENT_TOKEN) {
  // Keep the server running to allow late injection, but warn loudly.
  console.warn('AGENT_TOKEN is not set. All requests will be rejected until it is configured.');
}

app.use((req, res, next) => {
  const token = req.header('X-Agent-Token');

  if (!token || token !== AGENT_TOKEN) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return next();
});

app.use(infoRoutes(docker));
app.use(containerRoutes(docker));
app.use(imageRoutes(docker));
app.use(stackRoutes(docker));
app.use(portainerRoutes(docker));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(AGENT_PORT, () => {
  console.log(`Stackpulse Agent listening on port ${AGENT_PORT}`);
});
