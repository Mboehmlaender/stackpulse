import express from 'express';
import dotenv from 'dotenv';
import https from 'https';
import axios from 'axios';
import http from 'http';
import { spawn } from 'child_process';
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
import { getSetting, setSetting, deleteSetting } from './db/settings.js';
import { activateMaintenanceMode, deactivateMaintenanceMode, getMaintenanceState, isMaintenanceModeActive } from './maintenance/state.js';

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

const broadcastRedeployStatus = ({ stackId, stackName, phase, message }) => {
  const normalizedPhase = phase || (message ? 'info' : undefined);
  const isRedeploying = normalizedPhase === 'started';
  redeployingStacks[stackId] = Boolean(isRedeploying);

  const payload = {
    stackId,
    stackName,
    phase: normalizedPhase,
    message,
    isRedeploying
  };

  io.emit("redeployStatus", payload);

  const label = stackName ? `${stackName} (${stackId})` : `Stack ${stackId}`;
  const phaseLabel = normalizedPhase ?? (isRedeploying ? 'started' : 'success');
  console.log(`🔄 [RedeployStatus] ${label} -> ${phaseLabel}${message ? `: ${message}` : ""}`);
};

const REDEPLOY_TYPES = {
  SINGLE: 'Einzeln',
  ALL: 'Alle',
  SELECTION: 'Auswahl',
  MAINTENANCE: 'Wartung'
};

const SELF_STACK_ID = process.env.SELF_STACK_ID ? String(process.env.SELF_STACK_ID) : null;
const PORTAINER_SCRIPT_SETTING_KEY = 'portainer_update_script';

const DEFAULT_PORTAINER_UPDATE_SCRIPT = [
  'docker stop portainer',
  'docker rm portainer',
  'docker pull portainer/portainer-ee:lts',
  'docker run -d -p 8000:8000 -p 9443:9443 --name=portainer --restart=always -v /var/run/docker.sock:/var/run/docker.sock'
].join('\n');

let portainerUpdateState = {
  running: false,
  status: 'idle',
  stage: 'idle',
  startedAt: null,
  finishedAt: null,
  targetVersion: null,
  resultVersion: null,
  scriptSource: null,
  message: null,
  error: null,
  logs: []
};

const addUpdateLog = (message, level = 'info') => {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message
  };
  portainerUpdateState = {
    ...portainerUpdateState,
    logs: [...(portainerUpdateState.logs || []).slice(-50), entry]
  };
  console.log(`🛠️ [PortainerUpdate:${level}] ${message}`);
};

const updatePortainerState = (partial = {}) => {
  portainerUpdateState = {
    ...portainerUpdateState,
    ...partial
  };
  return portainerUpdateState;
};

const getPortainerUpdateStatus = () => ({
  ...portainerUpdateState
});

const getCustomPortainerScript = () => {
  const row = getSetting(PORTAINER_SCRIPT_SETTING_KEY);
  if (!row) return null;
  const value = typeof row.value === 'string' ? row.value.trim() : '';
  if (!value) return null;
  return {
    script: row.value,
    updatedAt: row.updated_at || null
  };
};

const saveCustomPortainerScript = (script) => {
  const normalized = String(script ?? '').replace(/\r?\n/g, '\n').trim();
  if (!normalized) {
    deleteSetting(PORTAINER_SCRIPT_SETTING_KEY);
    return null;
  }
  setSetting(PORTAINER_SCRIPT_SETTING_KEY, normalized);
  return normalized;
};

const getEffectivePortainerScript = () => {
  const custom = getCustomPortainerScript();
  if (custom) {
    return {
      script: custom.script,
      source: 'custom',
      updatedAt: custom.updatedAt
    };
  }
  return {
    script: DEFAULT_PORTAINER_UPDATE_SCRIPT,
    source: 'default',
    updatedAt: null
  };
};

const detectPortainerContainer = async () => {
  try {
    const containersRes = await axiosInstance.get(`/api/endpoints/${ENDPOINT_ID}/docker/containers/json`, {
      params: { all: true }
    });
    const containers = Array.isArray(containersRes.data) ? containersRes.data : [];

    const normalizeName = (value) => (typeof value === 'string' ? value.replace(/^\//, '').toLowerCase() : '');
    const isPortainerContainer = (container = {}) => {
      const names = Array.isArray(container.Names)
        ? container.Names.map(normalizeName)
        : [];
      const image = String(container.Image ?? '').toLowerCase();
      const labels = container.Labels || {};

      if (labels['io.portainer.container']) return true;
      if (labels['io.portainer.role'] === 'instance') return true;
      if (names.includes('portainer') || names.includes('portainer_ce')) return true;
      if (image.includes('portainer/portainer')) return true;
      if (image.includes('portainer-ce')) return true;
      return false;
    };

    const matchedContainer = containers.find((entry) => isPortainerContainer(entry));
    if (!matchedContainer) {
      return { summary: null, error: 'Portainer-Container nicht gefunden' };
    }

    const inspectRes = await axiosInstance.get(`/api/endpoints/${ENDPOINT_ID}/docker/containers/${matchedContainer.Id}/json`);
    const inspect = inspectRes.data ?? {};

    const trimName = (value) => (typeof value === 'string' ? value.replace(/^\//, '') : value);
    const toArray = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value.map((item) => String(item));
      return [String(value)];
    };

    const summary = {
      id: inspect.Id ?? matchedContainer.Id ?? null,
      name: trimName(inspect.Name) ?? (matchedContainer.Names?.[0] ? trimName(matchedContainer.Names[0]) : null),
      image: inspect.Config?.Image ?? matchedContainer.Image ?? null,
      created: inspect.Created ?? null,
      entrypoint: toArray(inspect.Config?.Entrypoint),
      command: toArray(inspect.Config?.Cmd),
      args: toArray(inspect.Args),
      env: Array.isArray(inspect.Config?.Env) ? inspect.Config.Env : [],
      binds: Array.isArray(inspect.HostConfig?.Binds) ? inspect.HostConfig.Binds : [],
      mounts: Array.isArray(inspect.Mounts)
        ? inspect.Mounts.map((mount) => ({
            type: mount.Type ?? null,
            source: mount.Source ?? null,
            destination: mount.Destination ?? null,
            mode: mount.Mode ?? null,
            rw: typeof mount.RW === 'boolean' ? mount.RW : null
          }))
        : [],
      labels: inspect.Config?.Labels ?? matchedContainer.Labels ?? {},
      ports: inspect.HostConfig?.PortBindings ?? null,
      networks: inspect.NetworkSettings?.Networks ?? null,
      restartPolicy: inspect.HostConfig?.RestartPolicy ?? null
    };

    return { summary, error: null };
  } catch (err) {
    const message = err.response?.data?.message || err.message;
    return { summary: null, error: message };
  }
};

const waitForPortainerAvailability = async ({ timeoutMs = 5 * 60 * 1000, intervalMs = 5000 } = {}) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await axiosInstance.get('/api/status');
      return true;
    } catch (err) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return false;
};

const normalizeVersion = (value) => {
  if (!value) return null;
  return String(value).trim().replace(/^v/i, '');
};

const semverParts = (value) => {
  const normalized = normalizeVersion(value);
  if (!normalized) return null;
  return normalized.split(/[.-]/).map((segment) => {
    const numericPart = segment.replace(/[^0-9].*$/, '');
    const parsed = Number.parseInt(numericPart, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  });
};

const compareSemver = (a, b) => {
  const partsA = semverParts(a) || [];
  const partsB = semverParts(b) || [];
  const length = Math.max(partsA.length, partsB.length);
  for (let index = 0; index < length; index += 1) {
    const valueA = partsA[index] ?? 0;
    const valueB = partsB[index] ?? 0;
    if (valueA > valueB) return 1;
    if (valueA < valueB) return -1;
  }
  return 0;
};

const fetchPortainerStatusSummary = async () => {
  const statusRes = await axiosInstance.get('/api/status');
  const statusData = statusRes.data ?? {};

  const currentVersion = statusData.Version
    ?? statusData.ServerVersion
    ?? statusData.Server?.Version
    ?? statusData.ServerInfo?.Version
    ?? statusData.ServerVersionNumber
    ?? null;
  const edition = statusData.Edition ?? statusData.Server?.Edition ?? null;
  const build = statusData.BuildNumber ?? statusData.Server?.Build ?? null;

  const errors = {};
  let latestVersion = null;

  const { summary: containerSummary, error: containerError } = await detectPortainerContainer();
  if (containerError) {
    errors.container = containerError;
  }

  try {
    const githubRes = await axios.get('https://api.github.com/repos/portainer/portainer/releases/latest', {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'StackPulse-Maintenance'
      },
      timeout: 5000
    });
    latestVersion = githubRes.data?.tag_name ?? githubRes.data?.tagName ?? null;
  } catch (err) {
    const message = err.response?.data?.message || err.message;
    console.warn(`⚠️ [Maintenance] Konnte Portainer-Latest-Version nicht ermitteln: ${message}`);
    errors.latestVersion = message;
  }

  if (!currentVersion) {
    errors.currentVersion = 'Portainer-Version konnte nicht ermittelt werden';
  }

  const normalizedCurrent = normalizeVersion(currentVersion);
  const normalizedLatest = normalizeVersion(latestVersion);
  const portainerFlag = typeof statusData.UpdateAvailable === 'boolean'
    ? statusData.UpdateAvailable
    : null;

  let updateAvailable = null;
  if (normalizedCurrent && normalizedLatest) {
    updateAvailable = compareSemver(normalizedCurrent, normalizedLatest) < 0;
  } else if (portainerFlag !== null) {
    updateAvailable = portainerFlag;
  }

  const responsePayload = {
    currentVersion,
    latestVersion,
    normalized: {
      current: normalizedCurrent,
      latest: normalizedLatest
    },
    updateAvailable,
    portainerFlag,
    edition: edition ?? null,
    build: build ?? null,
    fetchedAt: new Date().toISOString(),
    container: containerSummary
  };

  if (Object.keys(errors).length) {
    responsePayload.errors = errors;
  }

  return responsePayload;
};

const maintenanceGuard = (req, res, next) => {
  if (!isMaintenanceModeActive()) {
    return next();
  }

  return res.status(423).json({
    error: 'Wartungsmodus aktiv',
    maintenance: getMaintenanceState(),
    update: getPortainerUpdateStatus()
  });
};

const logScriptOutput = (data, level) => {
  if (!data) return;
  const text = data.toString();
  text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => addUpdateLog(line, level));
};

const executePortainerUpdateScript = async (script) => {
  const normalized = String(script ?? '').replace(/\r?\n/g, '\n').trim();
  if (!normalized) {
    addUpdateLog('Kein Update-Skript definiert. Vorgang wird übersprungen.', 'warning');
    return;
  }

  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-lc', `set -e\n${normalized}`], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', (chunk) => logScriptOutput(chunk, 'stdout'));
    child.stderr.on('data', (chunk) => logScriptOutput(chunk, 'stderr'));
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Update-Skript beendet mit Exit-Code ${code}`));
      }
    });
  });
};

let currentPortainerUpdatePromise = null;

const performPortainerUpdate = async ({ script, scriptSource, targetVersion }) => {
  let maintenanceActivated = false;

  try {
    addUpdateLog(`Portainer-Update gestartet (Quelle: ${scriptSource})`, 'info');
    updatePortainerState({
      status: 'running',
      stage: 'activating-maintenance',
      message: 'Wartungsmodus wird aktiviert'
    });

    const maintenanceDetails = {
      type: 'portainer-update',
      targetVersion: targetVersion ?? null,
      scriptSource
    };

    const maintenanceState = activateMaintenanceMode({
      message: 'Portainer Update läuft',
      extra: maintenanceDetails
    });
    maintenanceActivated = true;

    logRedeployEvent({
      stackId: 'portainer',
      stackName: 'Portainer',
      status: 'started',
      message: `Portainer Update gestartet (Ziel: ${targetVersion ?? 'unbekannt'})`,
      endpoint: ENDPOINT_ID,
      redeployType: REDEPLOY_TYPES.MAINTENANCE
    });

    logRedeployEvent({
      stackId: 'maintenance',
      stackName: 'StackPulse Wartung',
      status: 'started',
      message: 'Wartungsmodus aktiviert (Portainer Update)',
      endpoint: ENDPOINT_ID,
      redeployType: REDEPLOY_TYPES.MAINTENANCE
    });

    updatePortainerState({
      stage: 'executing-script',
      message: 'Update-Skript wird ausgeführt'
    });
    await executePortainerUpdateScript(script);

    addUpdateLog('Update-Skript erfolgreich abgeschlossen', 'info');
    updatePortainerState({
      stage: 'waiting',
      message: 'Warte auf Portainer-Verfügbarkeit'
    });

    const available = await waitForPortainerAvailability({ timeoutMs: 5 * 60 * 1000, intervalMs: 5000 });
    if (!available) {
      throw new Error('Portainer blieb nach dem Update unerreichbar');
    }

    addUpdateLog('Portainer antwortet wieder. Ermittle Version…', 'info');
    const statusAfter = await fetchPortainerStatusSummary().catch(() => null);
    const finalVersion = statusAfter?.currentVersion ?? null;

    logRedeployEvent({
      stackId: 'portainer',
      stackName: 'Portainer',
      status: 'success',
      message: `Portainer Update abgeschlossen (Version: ${finalVersion ?? 'unbekannt'})`,
      endpoint: ENDPOINT_ID,
      redeployType: REDEPLOY_TYPES.MAINTENANCE
    });

    updatePortainerState({
      running: false,
      status: 'success',
      stage: 'completed',
      finishedAt: new Date().toISOString(),
      message: 'Portainer Update abgeschlossen',
      error: null,
      resultVersion: finalVersion
    });

    addUpdateLog('Portainer Update erfolgreich abgeschlossen', 'success');

    if (maintenanceActivated || maintenanceState?.active) {
      deactivateMaintenanceMode({ message: 'Portainer Update abgeschlossen' });
      maintenanceActivated = false;
      logRedeployEvent({
        stackId: 'maintenance',
        stackName: 'StackPulse Wartung',
        status: 'success',
        message: 'Wartungsmodus deaktiviert',
        endpoint: ENDPOINT_ID,
        redeployType: REDEPLOY_TYPES.MAINTENANCE
      });
    }
  } catch (err) {
    const message = err?.message || 'Portainer Update fehlgeschlagen';
    logRedeployEvent({
      stackId: 'portainer',
      stackName: 'Portainer',
      status: 'error',
      message,
      endpoint: ENDPOINT_ID,
      redeployType: REDEPLOY_TYPES.MAINTENANCE
    });

    updatePortainerState({
      running: false,
      status: 'error',
      stage: 'failed',
      finishedAt: new Date().toISOString(),
      message,
      error: message
    });

    addUpdateLog(message, 'error');

    if (maintenanceActivated || isMaintenanceModeActive()) {
      deactivateMaintenanceMode({ message: 'Portainer Update fehlgeschlagen' });
      logRedeployEvent({
        stackId: 'maintenance',
        stackName: 'StackPulse Wartung',
        status: 'error',
        message: 'Wartungsmodus deaktiviert (Fehler)',
        endpoint: ENDPOINT_ID,
        redeployType: REDEPLOY_TYPES.MAINTENANCE
      });
    }
  } finally {
    currentPortainerUpdatePromise = null;
  }
};

const fetchPortainerStacks = async () => {
  const stacksRes = await axiosInstance.get('/api/stacks');
  return stacksRes.data.filter((stack) => stack.EndpointId === ENDPOINT_ID);
};

const buildStackCollections = (stacks = []) => {
  const collections = new Map();

  stacks.forEach((stack) => {
    const name = stack.Name || 'Unbenannt';
    const isSelf = SELF_STACK_ID && String(stack.Id) === SELF_STACK_ID;
    const entry = collections.get(name);

    if (!entry) {
      collections.set(name, {
        canonical: stack,
        isSelf,
        members: [stack]
      });
      return;
    }

    entry.members.push(stack);

    if (!entry.isSelf && isSelf) {
      entry.canonical = stack;
      entry.isSelf = true;
    }
  });

  const canonicalStacks = [];
  const duplicates = [];

  collections.forEach((entry, name) => {
    canonicalStacks.push(entry.canonical);

    if (entry.members.length > 1) {
      const seenIds = new Set();
      const duplicateEntries = entry.members.filter((member) => {
        const id = String(member.Id);
        if (id === String(entry.canonical.Id)) {
          return false;
        }
        if (seenIds.has(id)) {
          return false;
        }
        seenIds.add(id);
        return true;
      });

      if (duplicateEntries.length > 0) {
        duplicates.push({
          name,
          canonical: entry.canonical,
          members: duplicateEntries
        });
      }
    }
  });

  return { canonicalStacks, duplicates };
};

const loadStackCollections = async () => {
  const filteredStacks = await fetchPortainerStacks();
  return {
    filteredStacks,
    ...buildStackCollections(filteredStacks)
  };
};

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
app.get('/api/stacks', maintenanceGuard, async (req, res) => {
  console.log("ℹ️ [API] GET /api/stacks: Abruf gestartet");
  try {
    const { canonicalStacks, duplicates } = await loadStackCollections();
    const duplicateNames = duplicates.map((entry) => entry.name);
    const duplicateNameSet = new Set(duplicateNames);

    if (duplicateNames.length) {
      console.warn(`⚠️ [API] GET /api/stacks: Doppelte Stack-Namen erkannt: ${duplicateNames.join(', ')}`);
    }

    const stacksWithStatus = await Promise.all(
      canonicalStacks.map(async (stack) => {
        try {
          const statusRes = await axiosInstance.get(
            `/api/stacks/${stack.Id}/images_status?refresh=true`
          );
          const statusEmoji = statusRes.data.Status === 'outdated' ? '⚠️' : '✅';
          return {
            ...stack,
            updateStatus: statusEmoji,
            redeploying: redeployingStacks[stack.Id] || false,
            redeployDisabled: SELF_STACK_ID ? String(stack.Id) === SELF_STACK_ID : false,
            duplicateName: duplicateNameSet.has(stack.Name)
          };
        } catch (err) {
          console.error(`❌ Fehler beim Abrufen des Status für Stack ${stack.Id}:`, err.message);
          return {
            ...stack,
            updateStatus: '❌',
            redeploying: redeployingStacks[stack.Id] || false,
            redeployDisabled: SELF_STACK_ID ? String(stack.Id) === SELF_STACK_ID : false,
            duplicateName: duplicateNameSet.has(stack.Name)
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

app.get('/api/maintenance/portainer-status', async (req, res) => {
  console.log("🧭 [Maintenance] GET /api/maintenance/portainer-status: Prüfung gestartet");
  try {
    const payload = await fetchPortainerStatusSummary();
    res.json(payload);
  } catch (err) {
    const message = err.response?.data?.message || err.message || 'Unbekannter Fehler';
    console.error(`❌ [Maintenance] Fehler beim Prüfen des Portainer-Status: ${message}`);
    res.status(500).json({ error: message });
  }
});

app.get('/api/maintenance/config', (req, res) => {
  const custom = getCustomPortainerScript();
  const effective = getEffectivePortainerScript();

  res.json({
    maintenance: getMaintenanceState(),
    update: getPortainerUpdateStatus(),
    script: {
      default: DEFAULT_PORTAINER_UPDATE_SCRIPT,
      custom: custom?.script ?? null,
      customUpdatedAt: custom?.updatedAt ?? null,
      effective: effective.script,
      source: effective.source,
      updatedAt: effective.updatedAt
    }
  });
});

app.put('/api/maintenance/update-script', (req, res) => {
  if (portainerUpdateState.running) {
    return res.status(409).json({
      error: 'Aktualisierung läuft. Skript kann derzeit nicht geändert werden.',
      update: getPortainerUpdateStatus()
    });
  }

  const incoming = req.body?.script;
  if (typeof incoming !== 'string') {
    return res.status(400).json({ error: 'Feld "script" (string) wird benötigt.' });
  }

  saveCustomPortainerScript(incoming);

  const custom = getCustomPortainerScript();
  const effective = getEffectivePortainerScript();

  res.json({
    success: true,
    script: {
      default: DEFAULT_PORTAINER_UPDATE_SCRIPT,
      custom: custom?.script ?? null,
      customUpdatedAt: custom?.updatedAt ?? null,
      effective: effective.script,
      source: effective.source,
      updatedAt: effective.updatedAt
    }
  });
});

app.delete('/api/maintenance/update-script', (req, res) => {
  if (portainerUpdateState.running) {
    return res.status(409).json({
      error: 'Aktualisierung läuft. Skript kann derzeit nicht geändert werden.',
      update: getPortainerUpdateStatus()
    });
  }

  saveCustomPortainerScript('');
  const effective = getEffectivePortainerScript();

  res.json({
    success: true,
    script: {
      default: DEFAULT_PORTAINER_UPDATE_SCRIPT,
      custom: null,
      customUpdatedAt: null,
      effective: effective.script,
      source: effective.source,
      updatedAt: effective.updatedAt
    }
  });
});

app.get('/api/maintenance/update-status', (req, res) => {
  res.json({
    maintenance: getMaintenanceState(),
    update: getPortainerUpdateStatus()
  });
});

app.post('/api/maintenance/portainer-update', async (req, res) => {
  if (portainerUpdateState.running) {
    return res.status(409).json({
      error: 'Ein Portainer-Update läuft bereits.',
      update: getPortainerUpdateStatus()
    });
  }

  if (isMaintenanceModeActive()) {
    return res.status(423).json({
      error: 'Wartungsmodus ist bereits aktiv.',
      maintenance: getMaintenanceState()
    });
  }

  const overrideScript = typeof req.body?.script === 'string' ? req.body.script : null;
  let scriptSource = 'default';
  let scriptToRun = DEFAULT_PORTAINER_UPDATE_SCRIPT;

  if (overrideScript && overrideScript.trim().length) {
    scriptSource = 'override';
    scriptToRun = overrideScript.replace(/\r?\n/g, '\n');
  } else {
    const effective = getEffectivePortainerScript();
    scriptSource = effective.source;
    scriptToRun = effective.script;
  }

  let targetVersion = null;
  try {
    const statusBefore = await fetchPortainerStatusSummary();
    targetVersion = statusBefore?.latestVersion ?? statusBefore?.currentVersion ?? null;
  } catch (err) {
    console.warn('⚠️ [Maintenance] Konnte Portainer-Status vor Update nicht ermitteln:', err.message);
  }

  updatePortainerState({
    running: true,
    status: 'running',
    stage: 'initializing',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    targetVersion,
    scriptSource,
    message: 'Portainer Update wird vorbereitet',
    error: null,
    logs: []
  });

  addUpdateLog('Vorbereitung abgeschlossen, Update wird gestartet', 'info');

  res.json({
    success: true,
    maintenance: getMaintenanceState(),
    update: getPortainerUpdateStatus()
  });

  currentPortainerUpdatePromise = performPortainerUpdate({
    script: scriptToRun,
    scriptSource,
    targetVersion
  }).catch((err) => {
    console.error('❌ [Maintenance] Portainer Update Fehler:', err.message);
  });
});

app.get('/api/maintenance/duplicates', maintenanceGuard, async (req, res) => {
  console.log("🧹 [Maintenance] GET /api/maintenance/duplicates: Abruf gestartet");
  try {
    const { duplicates } = await loadStackCollections();

    const payload = duplicates
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => ({
        name: entry.name,
        canonical: {
          Id: entry.canonical.Id,
          Name: entry.canonical.Name,
          EndpointId: entry.canonical.EndpointId,
          Type: entry.canonical.Type,
          Created: entry.canonical.Created
        },
        duplicates: entry.members.map((stack) => ({
          Id: stack.Id,
          Name: stack.Name,
          EndpointId: stack.EndpointId,
          Type: stack.Type,
          Created: stack.Created
        }))
      }));

    res.json({
      total: payload.length,
      items: payload
    });
  } catch (err) {
    console.error(`❌ [Maintenance] Fehler beim Abrufen der Duplikate:`, err.message);
    res.status(500).json({ error: 'Fehler beim Abrufen der doppelten Stacks' });
  }
});

app.post('/api/maintenance/duplicates/cleanup', maintenanceGuard, async (req, res) => {
  const canonicalId = req.body?.canonicalId;
  const duplicateIdsInput = Array.isArray(req.body?.duplicateIds) ? req.body.duplicateIds : [];
  const duplicateIds = duplicateIdsInput
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);

  if (!canonicalId) {
    return res.status(400).json({ error: 'canonicalId ist erforderlich' });
  }

  if (!duplicateIds.length) {
    return res.status(400).json({ error: 'duplicateIds ist erforderlich' });
  }

  const canonicalIdStr = String(canonicalId);
  console.log(`🧹 [Maintenance] Bereinigung angefordert für Stack ${canonicalIdStr}. Ziel-IDs: ${duplicateIds.join(', ')}`);

  try {
    const { duplicates } = await loadStackCollections();
    const target = duplicates.find((entry) => String(entry.canonical.Id) === canonicalIdStr);

    if (!target) {
      return res.status(404).json({ error: 'Kein doppelter Stack für diese ID gefunden' });
    }

    const duplicatesToDelete = target.members.filter((stack) => duplicateIds.includes(String(stack.Id)));

    if (!duplicatesToDelete.length) {
      return res.status(400).json({ error: 'Keine passenden Duplikate gefunden' });
    }

    logRedeployEvent({
      stackId: target.canonical.Id,
      stackName: target.canonical.Name,
      status: 'started',
      message: `Bereinigung doppelter Stacks gestartet (${duplicatesToDelete.length} Einträge)`,
      endpoint: target.canonical.EndpointId,
      redeployType: REDEPLOY_TYPES.MAINTENANCE
    });

    const results = [];
    const errors = [];

    for (const stack of duplicatesToDelete) {
      try {
        await axiosInstance.delete(`/api/stacks/${stack.Id}`, {
          params: { endpointId: stack.EndpointId }
        });
        console.log(`🧹 [Maintenance] Stack entfernt: ${stack.Name} (${stack.Id})`);
        results.push({
          id: stack.Id,
          name: stack.Name,
          endpointId: stack.EndpointId,
          status: 'deleted'
        });
      } catch (err) {
        const message = err.response?.data?.message || err.message;
        console.error(`❌ [Maintenance] Fehler beim Entfernen von Stack ${stack.Id}:`, message);
        errors.push({ id: stack.Id, message });
        results.push({
          id: stack.Id,
          name: stack.Name,
          endpointId: stack.EndpointId,
          status: 'error',
          message
        });
      }
    }

    if (errors.length) {
      const failedIds = errors.map((entry) => entry.id).join(', ');
      logRedeployEvent({
        stackId: target.canonical.Id,
        stackName: target.canonical.Name,
        status: 'error',
        message: `Bereinigung fehlgeschlagen für IDs: ${failedIds}`,
        endpoint: target.canonical.EndpointId,
        redeployType: REDEPLOY_TYPES.MAINTENANCE
      });

      return res.status(500).json({
        success: false,
        canonical: {
          id: target.canonical.Id,
          name: target.canonical.Name,
          endpointId: target.canonical.EndpointId
        },
        results
      });
    }

    logRedeployEvent({
      stackId: target.canonical.Id,
      stackName: target.canonical.Name,
      status: 'success',
      message: `Bereinigung abgeschlossen. Entfernte IDs: ${results.map((entry) => entry.id).join(', ')}`,
      endpoint: target.canonical.EndpointId,
      redeployType: REDEPLOY_TYPES.MAINTENANCE
    });

    res.json({
      success: true,
      canonical: {
        id: target.canonical.Id,
        name: target.canonical.Name,
        endpointId: target.canonical.EndpointId
      },
      removed: results.length,
      results
    });
  } catch (err) {
    const message = err.response?.data?.message || err.message;
    console.error(`❌ [Maintenance] Fehler bei der Bereinigung:`, message);
    res.status(500).json({ error: message || 'Fehler bei der Bereinigung' });
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
app.put('/api/stacks/:id/redeploy', maintenanceGuard, async (req, res) => {
  const { id } = req.params;
  console.log(`🔄 PUT /api/stacks/${id}/redeploy: Redeploy gestartet`);

  let stack;
  try {
    const stackRes = await axiosInstance.get(`/api/stacks/${id}`);
    stack = stackRes.data;

    if (stack.EndpointId !== ENDPOINT_ID) {
      throw new Error(`Stack gehört nicht zum Endpoint ${ENDPOINT_ID}`);
    }

    broadcastRedeployStatus({
      stackId: stack.Id || id,
      stackName: stack.Name,
      phase: 'started'
    });

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

    broadcastRedeployStatus({
      stackId: stack.Id || id,
      stackName: stack.Name,
      phase: 'success'
    });
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
    const errorMessage = err.response?.data?.message || err.message;
    broadcastRedeployStatus({
      stackId: stack?.Id || id,
      stackName: stack?.Name,
      phase: 'error',
      message: errorMessage
    });
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
app.put('/api/stacks/redeploy-all', maintenanceGuard, async (req, res) => {
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
      console.log('ℹ️ Keine veralteten Stacks für Redeploy ALL vorhanden');
      return res.json({ success: true, message: 'Keine veralteten Stacks gefunden' });
    }

    for (const stack of eligibleStacks) {
      try {
        await axiosInstance.put(`/api/stacks/${stack.Id}/git/redeploy?endpointId=${stack.EndpointId}`);
        console.log(`✅ Redeploy ALL -> Stack ${stack.Name} (${stack.Id}) erfolgreich`);
      } catch (err) {
        console.error(`❌ Redeploy ALL -> Stack ${stack.Name} (${stack.Id}) fehlgeschlagen:`, err.message);
      }
    }

    logRedeployEvent({
      stackId: '---',
      stackName: '---',
      status: 'success',
      message: 'Redeploy ALL abgeschlossen',
      endpoint: ENDPOINT_ID,
      redeployType: REDEPLOY_TYPES.ALL
    });

    res.json({ success: true, message: 'Redeploy ALL abgeschlossen' });
  } catch (err) {
    const message = err.response?.data?.message || err.message;
    logRedeployEvent({
      stackId: '---',
      stackName: '---',
      status: 'error',
      message,
      endpoint: ENDPOINT_ID,
      redeployType: REDEPLOY_TYPES.ALL
    });
    console.error('❌ Fehler bei Redeploy ALL:', message);
    res.status(500).json({ error: message });
  }
});

// Redeploy selection
app.put('/api/stacks/redeploy-selection', maintenanceGuard, async (req, res) => {
  const { stackIds } = req.body || {};
  console.log(`🚀 PUT /api/stacks/redeploy-selection: Redeploy Auswahl gestartet (${Array.isArray(stackIds) ? stackIds.length : 0} Stacks)`);

  if (!Array.isArray(stackIds) || stackIds.length === 0) {
    return res.status(400).json({ error: 'stackIds muss eine nicht leere Array sein' });
  }

  try {
    for (const id of stackIds) {
      await axiosInstance.put(`/api/stacks/${id}/git/redeploy?endpointId=${ENDPOINT_ID}`);
    }

    logRedeployEvent({
      stackId: stackIds.join(','),
      stackName: `Auswahl (${stackIds.length})`,
      status: 'success',
      message: 'Redeploy Auswahl abgeschlossen',
      endpoint: ENDPOINT_ID,
      redeployType: REDEPLOY_TYPES.SELECTION
    });

    res.json({ success: true, message: 'Redeploy Auswahl abgeschlossen' });
  } catch (err) {
    const message = err.response?.data?.message || err.message;
    logRedeployEvent({
      stackId: stackIds.join(','),
      stackName: `Auswahl (${stackIds.length})`,
      status: 'error',
      message,
      endpoint: ENDPOINT_ID,
      redeployType: REDEPLOY_TYPES.SELECTION
    });
    console.error('❌ Fehler bei Redeploy Auswahl:', message);
    res.status(500).json({ error: message });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
});

