import express from 'express';
import dotenv from 'dotenv';
import https from 'https';
import axios from 'axios';
import http from 'http';
import { spawn } from 'child_process';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { db } from './db/index.js';
import { ensureDatabaseSchema } from './db/schemaEnsure.js';
import {
  ensureSuperuserFromEnv,
  getSuperuserSummary,
  hasSuperuser,
  registerSuperuser,
  removeSuperuser,
  findUserByIdentifier,
  markUserLogin,
  verifyPassword,
  SUPERUSER_GROUP_NAME
} from './auth/superuser.js';
import {
  logEvent,
  buildEventLogFilter,
  deleteEventLogById,
  deleteEventLogsByFilters,
  exportEventLogsByFilters
} from './logging/eventLogs.js';
import { getSetting, setSetting, deleteSetting } from './db/settings.js';
import { activateMaintenanceMode, deactivateMaintenanceMode, getMaintenanceState, isMaintenanceModeActive } from './maintenance/state.js';
import {
  ensureDefaultsFromEnv,
  getActiveApiKey,
  getActiveServerUrl,
  hasServer,
  hasApiKey,
  getSetupStatus,
  completeSetup,
  removeServer,
  setServerApiKey
} from './setup/index.js';
import {
  listUsers,
  getUserById,
  updateUserGroups,
  createUser,
  updateUserDetails,
  deleteUser,
  updateUserActiveStatus,
  getUserSecurityPhrase,
  renewUserSecurityPhrase,
  markSecurityPhraseDownloaded,
  ensureSecurityPhrasesForExistingUsers,
  verifySecurityPhraseForUsername,
  setUserPassword
} from './users/index.js';
import { listGroups, createGroup, getGroupById, updateGroupDetails, deleteGroup } from './groups/index.js';
import {
  getPermissionStructure,
  getPermissionValuesByGroup,
  saveGroupPermissionValues,
  clearGroupPermissionValues,
  getSuperuserPermissionMap,
  getEffectivePermissionsForGroups,
  hasRequiredPermission
} from './permissions/index.js';

dotenv.config();

ensureDatabaseSchema();
ensureSuperuserFromEnv();
ensureDefaultsFromEnv();

try {
  const initializedCount = ensureSecurityPhrasesForExistingUsers();
  if (initializedCount > 0) {
    console.log(`ℹ️ Sicherheitsschlüssel für ${initializedCount} bestehende Benutzer initialisiert`);
  }
} catch (error) {
  console.error('⚠️ Initialisierung der Sicherheitsschlüssel für bestehende Benutzer fehlgeschlagen:', error);
}

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

const agent = new https.Agent({ rejectUnauthorized: false });

const resolvePortainerBaseUrl = () => {
  const envUrl = typeof process.env.PORTAINER_URL === 'string' ? process.env.PORTAINER_URL.trim() : '';
  if (envUrl) return envUrl;
  const activeUrl = getActiveServerUrl();
  return activeUrl ? activeUrl.trim() : '';
};

const axiosInstance = axios.create({
  httpsAgent: agent
});

axiosInstance.interceptors.request.use((config) => {
  const currentBase = typeof config.baseURL === 'string' ? config.baseURL.trim() : '';
  const effectiveBase = currentBase || resolvePortainerBaseUrl();
  if (!effectiveBase) {
    throw new Error('PORTAINER_URL_NOT_CONFIGURED');
  }
  config.baseURL = effectiveBase;

  const apiKey = getActiveApiKey();
  if (apiKey) {
    config.headers = config.headers || {};
    config.headers["X-API-Key"] = apiKey;
  } else if (config.headers?.["X-API-Key"]) {
    delete config.headers["X-API-Key"];
  }
  return config;
});

const PORTAINER_ENVIRONMENT_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedPortainerEnvironment = { id: null, fetchedAt: 0 };
let resolvingEnvironmentPromise = null;

const resolvePortainerEnvironmentId = async () => {
  const now = Date.now();
  if (cachedPortainerEnvironment.id && now - cachedPortainerEnvironment.fetchedAt < PORTAINER_ENVIRONMENT_CACHE_TTL_MS) {
    return cachedPortainerEnvironment.id;
  }

  if (resolvingEnvironmentPromise) {
    return resolvingEnvironmentPromise;
  }

  resolvingEnvironmentPromise = (async () => {
    try {
      const endpointsRes = await axiosInstance.get('/api/endpoints');
      const endpoints = Array.isArray(endpointsRes.data) ? endpointsRes.data : [];
      if (!endpoints.length) {
        const error = new Error('PORTAINER_ENVIRONMENT_NOT_FOUND');
        error.code = 'PORTAINER_ENVIRONMENT_NOT_FOUND';
        throw error;
      }
      const preferred =
        endpoints.find((endpoint) => endpoint.Type === 1 && (!endpoint.URL || endpoint.URL === '')) ||
        endpoints[0];
      const resolvedId = preferred?.Id ?? preferred?.ID ?? null;
      if (!resolvedId) {
        const error = new Error('PORTAINER_ENVIRONMENT_NOT_FOUND');
        error.code = 'PORTAINER_ENVIRONMENT_NOT_FOUND';
        throw error;
      }
      cachedPortainerEnvironment = {
        id: String(resolvedId),
        fetchedAt: Date.now()
      };
      return cachedPortainerEnvironment.id;
    } catch (error) {
      const normalized = error.response?.data?.message || error.message || 'PORTAINER_ENVIRONMENT_NOT_FOUND';
      console.error('⚠️ [Portainer] Environment-Erkennung fehlgeschlagen:', normalized);
      const wrapped = new Error('PORTAINER_ENVIRONMENT_NOT_FOUND');
      wrapped.code = 'PORTAINER_ENVIRONMENT_NOT_FOUND';
      throw wrapped;
    } finally {
      resolvingEnvironmentPromise = null;
    }
  })();

  return resolvingEnvironmentPromise;
};

const normalizeExternalPortainerUrl = (value = '') => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
    const candidate = hasProtocol ? trimmed : `https://${trimmed}`;
    const normalized = new URL(candidate);
    normalized.hash = '';
    return normalized.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
};

const createPortainerSetupClient = ({ baseURL, apiKey }) => {
  if (!baseURL) {
    const error = new Error('SERVER_URL_REQUIRED');
    error.code = 'SERVER_URL_REQUIRED';
    throw error;
  }
  if (!apiKey) {
    const error = new Error('API_KEY_REQUIRED');
    error.code = 'API_KEY_REQUIRED';
    throw error;
  }
  return axios.create({
    baseURL,
    httpsAgent: agent,
    headers: {
      'X-API-Key': apiKey
    }
  });
};

const extractPortainerCredentials = (payload = {}) => {
  const rawServer = payload.server ?? {};
  const serverUrl =
    typeof rawServer.url === 'string' ? rawServer.url :
      typeof payload.serverUrl === 'string' ? payload.serverUrl :
        typeof payload.url === 'string' ? payload.url : '';
  const apiKey =
    typeof payload.apiKey === 'string' ? payload.apiKey :
      typeof payload.key === 'string' ? payload.key :
        typeof payload.api === 'string' ? payload.api :
          typeof payload?.api?.value === 'string' ? payload.api.value :
            '';

  return {
    serverUrl: serverUrl ? serverUrl.trim() : '',
    apiKey: apiKey ? apiKey.trim() : ''
  };
};

const REDEPLOY_PHASES = {
  QUEUED: 'queued',
  STARTED: 'started',
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info'
};

const redeployingStacks = new Map();

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'sp_auth_token';
const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const envSessionTtl = Number(process.env.AUTH_SESSION_TTL_MS);
const AUTH_SESSION_TTL_MS = Number.isFinite(envSessionTtl) && envSessionTtl > 0 ? envSessionTtl : DEFAULT_SESSION_TTL_MS;

const parseBooleanEnv = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const AUTH_COOKIE_SECURE = parseBooleanEnv(process.env.AUTH_COOKIE_SECURE, false);

const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: AUTH_COOKIE_SECURE,
  path: '/'
};

const activeSessions = new Map();
const passwordResetTickets = new Map();
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 15;

const PUBLIC_API_ROUTES = [
  { method: 'GET', matcher: /^\/api\/auth\/superuser\/status$/ },
  { method: 'POST', matcher: /^\/api\/auth\/superuser\/register$/ },
  { method: 'POST', matcher: /^\/api\/auth\/login$/ },
  { method: 'POST', matcher: /^\/api\/auth\/logout$/ },
  { method: 'GET', matcher: /^\/api\/auth\/session$/ },
  { method: 'POST', matcher: /^\/api\/auth\/recover\/verify$/ },
  { method: 'POST', matcher: /^\/api\/auth\/recover\/reset$/ },
  { method: 'GET', matcher: /^\/api\/setup\/status$/ },
  { method: 'POST', matcher: /^\/api\/setup\/complete$/ },
  { method: 'POST', matcher: /^\/api\/setup\/test-portainer$/ },
  { method: 'POST', matcher: /^\/api\/setup\/portainer-stacks$/ }
];

const sanitizeUser = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  avatarColor: user.avatar_color || null
});

const buildUserSessionPayload = (userId) => {
  const record = getUserById(userId);
  if (!record || !record.isActive) {
    return null;
  }

  const groups = Array.isArray(record.groups) ? record.groups : [];
  const groupIds = groups
    .map((group) => Number(group.id))
    .filter((groupId) => Number.isFinite(groupId) && groupId > 0);

  const isSuperuser = groups.some(
    (group) => typeof group?.name === 'string' && group.name.toLowerCase() === SUPERUSER_GROUP_NAME
  );

  const permissions = isSuperuser
    ? getSuperuserPermissionMap()
    : getEffectivePermissionsForGroups(groupIds);

  return {
    user: {
      id: record.id,
      username: record.username,
      email: record.email || null,
      avatarColor: record.avatarColor || null,
      groups,
      isSuperuser,
      securityPhraseDownloadedAt: record.securityPhraseDownloadedAt || null,
      requiresSecurityPhraseDownload: !record.securityPhraseDownloadedAt
    },
    permissions
  };
};

const cleanupExpiredSessions = () => {
  const now = Date.now();
  for (const [token, session] of activeSessions.entries()) {
    if (!session || session.expiresAt <= now) {
      activeSessions.delete(token);
    }
  }
};

const removeSessionsForUser = (userId) => {
  if (!userId) return;
  for (const [token, session] of activeSessions.entries()) {
    if (session?.userId === userId) {
      activeSessions.delete(token);
    }
  }
};

const cleanupExpiredPasswordResetTickets = () => {
  const now = Date.now();
  for (const [token, ticket] of passwordResetTickets.entries()) {
    if (!ticket || ticket.expiresAt <= now) {
      passwordResetTickets.delete(token);
    }
  }
};

const removePasswordResetTicketsForUser = (userId) => {
  if (!userId) return;
  for (const [token, ticket] of passwordResetTickets.entries()) {
    if (ticket?.userId === userId) {
      passwordResetTickets.delete(token);
    }
  }
};

const createPasswordResetTicketForUser = (userId) => {
  cleanupExpiredPasswordResetTickets();
  removePasswordResetTicketsForUser(userId);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + PASSWORD_RESET_TTL_MS;
  passwordResetTickets.set(token, { userId, expiresAt });
  return { token, expiresAt };
};

const getPasswordResetTicket = (token) => {
  if (!token) {
    return null;
  }
  cleanupExpiredPasswordResetTickets();
  const record = passwordResetTickets.get(token);
  if (!record) {
    return null;
  }
  if (record.expiresAt <= Date.now()) {
    passwordResetTickets.delete(token);
    return null;
  }
  return record;
};

const createSessionForUser = (user) => {
  cleanupExpiredSessions();
  removeSessionsForUser(user.id);
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = Date.now() + AUTH_SESSION_TTL_MS;
  activeSessions.set(token, { userId: user.id, expiresAt });
  return { token, expiresAt };
};

const getSessionRecord = (token) => {
  if (!token) return null;
  cleanupExpiredSessions();
  const record = activeSessions.get(token);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    activeSessions.delete(token);
    return null;
  }
  return record;
};

const touchSession = (token) => {
  if (!token) return;
  const record = activeSessions.get(token);
  if (!record) return;
  record.expiresAt = Date.now() + AUTH_SESSION_TTL_MS;
  activeSessions.set(token, record);
};

const extractAuthToken = (req) => {
  const rawCookie = req.headers?.cookie;
  if (rawCookie && typeof rawCookie === 'string') {
    const parts = rawCookie.split(';');
    for (const part of parts) {
      const [name, ...rest] = part.trim().split('=');
      if (name === AUTH_COOKIE_NAME) {
        return rest.join('=');
      }
    }
  }
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (authHeader && typeof authHeader === 'string') {
    const lower = authHeader.toLowerCase();
    if (lower.startsWith('bearer ')) {
      return authHeader.slice(7).trim();
    }
  }
  return null;
};

const setAuthCookie = (res, token) => {
  if (!token || !res) return;
  if (typeof res.cookie === 'function') {
    res.cookie(AUTH_COOKIE_NAME, token, {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: AUTH_SESSION_TTL_MS
    });
  } else {
    res.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax`);
  }
};

const clearAuthCookie = (res) => {
  if (!res) return;
  if (typeof res.clearCookie === 'function') {
    res.clearCookie(AUTH_COOKIE_NAME, {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: 0
    });
  } else {
    res.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0`);
  }
};

const isPublicApiRoute = (req) => {
  return PUBLIC_API_ROUTES.some(({ method, matcher }) => req.method === method && matcher.test(req.path));
};

const isActiveRedeployPhase = (phase) => phase === REDEPLOY_PHASES.QUEUED || phase === REDEPLOY_PHASES.STARTED;

const resolveRedeployPhase = (phase, message) => {
  if (phase) return phase;
  if (message) return REDEPLOY_PHASES.INFO;
  return REDEPLOY_PHASES.SUCCESS;
};

const server = http.createServer(app);
const io = new Server(server, {
  path: "/socket.io",
  cors: { origin: "*" }
});
io.on("connection", (socket) => {
  console.log(`🔌 [Socket] Client verbunden: ${socket.id}`);
});

const broadcastRedeployStatus = ({ stackId, stackName, phase, message }) => {
  if (!stackId) return;

  const resolvedPhase = resolveRedeployPhase(phase, message);
  const isRedeploying = isActiveRedeployPhase(resolvedPhase);

  if (isRedeploying) {
    redeployingStacks.set(String(stackId), {
      phase: resolvedPhase,
      stackName: stackName || null,
      message: message || null,
      updatedAt: Date.now()
    });
  } else if (resolvedPhase === REDEPLOY_PHASES.SUCCESS || resolvedPhase === REDEPLOY_PHASES.ERROR || resolvedPhase === 'idle') {
    redeployingStacks.delete(String(stackId));
  }

  const payload = {
    stackId,
    stackName,
    phase: resolvedPhase,
    message,
    isRedeploying,
    redeployPhase: resolvedPhase
  };

  io.emit("redeployStatus", payload);

  const label = stackName ? `${stackName} (${stackId})` : `Stack ${stackId}`;
  console.log(`🔄 [RedeployStatus] ${label} -> ${resolvedPhase}${message ? `: ${message}` : ""}`);
};

const REDEPLOY_TYPES = {
  SINGLE: 'Einzeln',
  ALL: 'Alle',
  SELECTION: 'Auswahl',
  MAINTENANCE: 'Wartung'
};

const logStackEvent = ({
  stackId,
  stackName,
  status,
  message,
  redeployType = null,
  metadata = {}
}) => {
  const metadataPayload = {
    ...metadata
  };

  if (redeployType) {
    metadataPayload.redeployType = redeployType;
  }

  const hasMetadata = Object.keys(metadataPayload).length > 0;
  const serverContextId = getActiveServerUrl() || null;

  logEvent({
    category: 'stack',
    eventType: redeployType ?? null,
    action: 'redeploy',
    status: status ?? null,
    entityType: 'stack',
    entityId: stackId !== undefined && stackId !== null ? String(stackId) : null,
    entityName: stackName ?? null,
    contextType: serverContextId ? 'server' : null,
    contextId: serverContextId,
    message: message ?? null,
    metadata: hasMetadata ? metadataPayload : null
  });
};

const parseJsonColumn = (value) => {
  if (value === undefined || value === null || value === '') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const SELF_STACK_SETTING_KEY = 'self_stack_id';
let cachedSelfStackId = null;
let selfStackLoaded = false;

const loadSelfStackId = () => {
  try {
    const stored = getSetting(SELF_STACK_SETTING_KEY);
    if (stored && stored.value) {
      cachedSelfStackId = String(stored.value);
    } else if (process.env.SELF_STACK_ID) {
      cachedSelfStackId = String(process.env.SELF_STACK_ID);
    } else {
      cachedSelfStackId = null;
    }
  } catch (error) {
    console.warn('⚠️ [Setup] Konnte Self-Stack-ID nicht laden:', error.message);
    cachedSelfStackId = process.env.SELF_STACK_ID ? String(process.env.SELF_STACK_ID) : null;
  } finally {
    selfStackLoaded = true;
  }
};

const getSelfStackId = () => {
  if (!selfStackLoaded) {
    loadSelfStackId();
  }
  return cachedSelfStackId;
};

const persistSelfStackId = (value) => {
  const normalized = typeof value === 'string'
    ? value.trim()
    : value !== undefined && value !== null
      ? String(value).trim()
      : '';

  if (!normalized) {
    deleteSetting(SELF_STACK_SETTING_KEY);
    cachedSelfStackId = process.env.SELF_STACK_ID ? String(process.env.SELF_STACK_ID) : null;
  } else {
    setSetting(SELF_STACK_SETTING_KEY, normalized);
    cachedSelfStackId = normalized;
  }
  selfStackLoaded = true;
  return cachedSelfStackId;
};

const getEnvSelfStackId = () => {
  const raw = typeof process.env.SELF_STACK_ID === 'string' ? process.env.SELF_STACK_ID : '';
  return raw.trim();
};

const applySelfStackStatus = (status) => {
  const envSelfStackId = getEnvSelfStackId();
  const currentSelfStackId = getSelfStackId();
  const envDefaults = { ...(status.envDefaults || {}) };
  envDefaults.selfStackId = currentSelfStackId || envSelfStackId || envDefaults.selfStackId || '';

  return {
    ...status,
    envDefaults,
    selfStack: {
      current: currentSelfStackId,
      envProvided: Boolean(envSelfStackId)
    }
  };
};

const buildSetupStatusResponse = () => applySelfStackStatus(getSetupStatus());

const PORTAINER_SCRIPT_SETTING_KEY = 'portainer_update_script';
const PORTAINER_SSH_CONFIG_KEY = 'portainer_ssh_config';

const DEFAULT_PORTAINER_UPDATE_SCRIPT = [
  'docker stop portainer',
  'docker rm portainer',
  'docker pull portainer/portainer-ee:lts',
  'docker run -d -p 8000:8000 -p 9443:9443 --name=portainer --restart=always -v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data portainer/portainer-ee:lts'
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
  const raw = typeof row.value === 'string' ? row.value : '';
  if (!raw.trim()) return null;
  return {
    script: normalizeScriptText(raw),
    updatedAt: row.updated_at || null
  };
};

const normalizeScriptText = (script) => String(script ?? '').replace(/\r\n/g, '\n');

const saveCustomPortainerScript = (script) => {
  const normalized = normalizeScriptText(script);
  if (!normalized.trim()) {
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


const SSH_ENCRYPTION_KEY = crypto.createHash('sha256')
  .update(process.env.PORTAINER_SSH_SECRET || process.env.PORTAINER_API_KEY || 'stackpulse-portainer-ssh-secret')
  .digest();

const encryptSensitive = (value) => {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SSH_ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    content: encrypted.toString('base64'),
    tag: authTag.toString('base64')
  };
};

const decryptSensitive = (payload) => {
  if (!payload || !payload.content) return '';
  try {
    const iv = Buffer.from(payload.iv, 'base64');
    const content = Buffer.from(payload.content, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', SSH_ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.warn('⚠️ [Maintenance] Konnte privaten SSH Schlüssel nicht entschlüsseln:', err.message);
    return '';
  }
};

const DEFAULT_PORTAINER_SSH_CONFIG = {
  host: '',
  port: 22,
  username: '',
  password: '',
  extraSshArgs: []
};

const normalizeString = (value, fallback = '') => {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
};

const normalizePort = (value, fallback = DEFAULT_PORTAINER_SSH_CONFIG.port) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const tokenizeSshArgLine = (line) => {
  if (!line) return [];
  const tokens = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    if (match[1] !== undefined) {
      tokens.push(match[1]);
    } else if (match[2] !== undefined) {
      tokens.push(match[2]);
    } else if (match[3] !== undefined) {
      tokens.push(match[3]);
    }
  }
  return tokens;
};

const normalizeExtraArgs = (value, fallback = []) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return Array.isArray(fallback) ? [...fallback] : [];
};

const normalizePassword = (value, fallback = DEFAULT_PORTAINER_SSH_CONFIG.password) => {
  if (value === undefined) return fallback;
  if (value === null) return '';
  return String(value);
};

const getPortainerSshConfig = () => {
  const stored = getSetting(PORTAINER_SSH_CONFIG_KEY);
  if (!stored) {
    return { ...DEFAULT_PORTAINER_SSH_CONFIG };
  }
  try {
    const parsed = stored.value ? JSON.parse(stored.value) : {};
    const decryptedPassword = parsed.passwordEncrypted ? decryptSensitive(parsed.passwordEncrypted) : null;
    const fallbackPassword = parsed.password !== undefined ? parsed.password : null;
    return {
      host: normalizeString(parsed.host),
      port: normalizePort(parsed.port),
      username: normalizeString(parsed.username),
      password: normalizePassword(decryptedPassword ?? fallbackPassword),
      extraSshArgs: normalizeExtraArgs(parsed.extraSshArgs)
    };
  } catch (err) {
    console.warn('⚠️ [Maintenance] Konnte Portainer SSH Konfiguration nicht parsen:', err.message);
    return { ...DEFAULT_PORTAINER_SSH_CONFIG };
  }
};

const persistPortainerSshConfig = (config) => {
  const payload = {
    host: config.host,
    port: config.port,
    username: config.username,
    extraSshArgs: config.extraSshArgs,
    passwordEncrypted: config.password ? encryptSensitive(config.password) : null
  };
  setSetting(PORTAINER_SSH_CONFIG_KEY, JSON.stringify(payload));
};

const mergeSshConfig = (base, overrides = {}) => ({
  host: normalizeString(overrides.host, base.host),
  port: normalizePort(overrides.port, base.port),
  username: normalizeString(overrides.username, base.username),
  password: normalizePassword(overrides.password, base.password),
  extraSshArgs: normalizeExtraArgs(overrides.extraSshArgs, base.extraSshArgs)
});

const savePortainerSshConfig = (payload = {}) => {
  const current = getPortainerSshConfig();
  const next = mergeSshConfig(current, payload);
  persistPortainerSshConfig(next);
  return next;
};

const deletePortainerSshConfig = () => {
  deleteSetting(PORTAINER_SSH_CONFIG_KEY);
  return { ...DEFAULT_PORTAINER_SSH_CONFIG };
};

const createTempAskPassScript = (secret) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stackpulse-askpass-'));
  const scriptPath = path.join(tmpDir, 'askpass.sh');
  const scriptContent = "#!/bin/sh\nprintf '%s\n' \"$STACKPULSE_SSH_PASS\"\n";
  fs.writeFileSync(scriptPath, scriptContent, { mode: 0o700 });
  return {
    env: {
      SSH_ASKPASS: scriptPath,
      SSH_ASKPASS_REQUIRE: 'force',
      DISPLAY: process.env.DISPLAY || ':9999',
      STACKPULSE_SSH_PASS: secret
    },
    cleanup: () => {
      try {
        fs.unlinkSync(scriptPath);
      } catch (err) { }
      try {
        fs.rmdirSync(tmpDir);
      } catch (err) { }
    }
  };
};

const buildSshCommandArgs = (config) => {
  const sshConfig = mergeSshConfig(DEFAULT_PORTAINER_SSH_CONFIG, config);
  if (!sshConfig.host) {
    throw new Error('SSH Host ist nicht konfiguriert');
  }
  if (!sshConfig.username) {
    throw new Error('SSH Benutzer ist nicht konfiguriert');
  }

  const args = [
    '-p', String(sshConfig.port),
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'PreferredAuthentications=password',
    '-o', 'PubkeyAuthentication=no',
    '-o', 'NumberOfPasswordPrompts=1'
  ];

  const cleanupTasks = [];
  const registerCleanup = (fn) => {
    if (typeof fn === 'function') {
      cleanupTasks.push(fn);
    }
  };

  let envOverrides = {};
  if (sshConfig.password) {
    const { env, cleanup: dispose } = createTempAskPassScript(sshConfig.password);
    envOverrides = { ...envOverrides, ...env };
    registerCleanup(dispose);
    args.push('-o', 'BatchMode=no');
  } else {
    args.push('-o', 'BatchMode=yes');
  }

  if (sshConfig.extraSshArgs.length) {
    const expanded = sshConfig.extraSshArgs.flatMap((entry) => tokenizeSshArgLine(entry));
    if (expanded.length) {
      args.push(...expanded);
    }
  }

  args.push(`${sshConfig.username}@${sshConfig.host}`);

  const cleanup = () => {
    while (cleanupTasks.length) {
      const task = cleanupTasks.pop();
      try {
        task();
      } catch (err) { }
    }
  };

  return { args, sshConfig, cleanup, env: envOverrides };
};

const ensureSshConfigReady = () => getPortainerSshConfig();

const testSshConnection = async (configOverride = null) => {
  const baseConfig = configOverride
    ? mergeSshConfig(getPortainerSshConfig(), configOverride)
    : ensureSshConfigReady();
  const hasHost = Boolean(baseConfig.host && baseConfig.username);
  if (!hasHost) {
    throw new Error('SSH-Konfiguration ist unvollständig (Host/Benutzer erforderlich).');
  }

  const { args, env: envOverrides, cleanup } = buildSshCommandArgs(baseConfig);
  const sshArgs = [...args, 'echo', '__PORTAINER_SSH_TEST__'];

  try {
    return await new Promise((resolve, reject) => {
      const childEnv = { ...process.env, ...envOverrides };
      const child = spawn('ssh', sshArgs, { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      let errorOutput = '';
      child.stdout.on('data', (chunk) => { output += chunk.toString(); });
      child.stderr.on('data', (chunk) => { errorOutput += chunk.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0 && output.includes('__PORTAINER_SSH_TEST__')) {
          resolve({ success: true, output: output.trim() });
        } else {
          const message = errorOutput.trim() || `SSH Test fehlgeschlagen (Exit-Code ${code})`;
          reject(new Error(message));
        }
      });
    });
  } finally {
    cleanup();
  }
};

const detectPortainerContainer = async () => {
  try {
    const endpointId = await resolvePortainerEnvironmentId();
    const containersRes = await axiosInstance.get(`/api/endpoints/${endpointId}/docker/containers/json`, {
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

    const inspectRes = await axiosInstance.get(`/api/endpoints/${endpointId}/docker/containers/${matchedContainer.Id}/json`);
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

const requirePermission = (permissionKey, requiredLevel = 'full') => (req, res, next) => {
  if (!permissionKey) {
    return next();
  }

  if (req.user?.isSuperuser) {
    return next();
  }

  const permissions = req.userPermissions || {};
  if (hasRequiredPermission(permissions, permissionKey, requiredLevel)) {
    return next();
  }

  return res.status(403).json({
    error: 'INSUFFICIENT_PERMISSIONS',
    permission: permissionKey,
    requiredLevel
  });
};

const requireAnyPermission = (candidates = []) => (req, res, next) => {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return next();
  }

  if (req.user?.isSuperuser) {
    return next();
  }

  const permissions = req.userPermissions || {};
  const granted = candidates.some(({ key, level }) =>
    typeof key === 'string' && hasRequiredPermission(permissions, key, level || 'full')
  );

  if (granted) {
    return next();
  }

  return res.status(403).json({
    error: 'INSUFFICIENT_PERMISSIONS',
    permission: candidates.map((entry) => entry.key).filter(Boolean),
    requiredLevel: candidates.map((entry) => entry.level || 'full')
  });
};

const logScriptOutput = (data, level) => {
  if (!data) return;
  const text = data.toString();
  text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => addUpdateLog(line, level));
};

const executePortainerUpdateScript = async (script) => {
  const normalized = normalizeScriptText(script);
  if (!normalized.trim()) {
    addUpdateLog('Kein Update-Skript definiert. Vorgang wird übersprungen.', 'warning');
    return;
  }

  const scriptWithUnixNewlines = normalized.endsWith('\n') ? normalized : `${normalized}\n`;

  const sshConfig = getPortainerSshConfig();
  const useSsh = Boolean(sshConfig.host && sshConfig.username);

  if (!useSsh) {
    addUpdateLog('Führe Update-Skript lokal auf dem StackPulse-Host aus.', 'info');
    return new Promise((resolve, reject) => {
      const child = spawn('bash', ['-lc', `set -e\n${scriptWithUnixNewlines}`], {
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
  }

  const { args, env: envOverrides, cleanup } = buildSshCommandArgs(sshConfig);
  const sshArgs = [...args, 'bash', '-s'];

  addUpdateLog(`Verbinde zu ${sshConfig.username}@${sshConfig.host} für Update-Skript`, 'info');

  const sshPromise = new Promise((resolve, reject) => {
    const childEnv = { ...process.env, ...envOverrides };
    const child = spawn('ssh', sshArgs, {
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    child.stdout.on('data', (chunk) => logScriptOutput(chunk, 'stdout'));
    child.stderr.on('data', (chunk) => logScriptOutput(chunk, 'stderr'));
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`SSH Befehl beendet mit Exit-Code ${code}`));
      }
    });

    child.stdin.write(`set -e
${scriptWithUnixNewlines}`);
    child.stdin.end();
  });

  return sshPromise.finally(() => cleanup());
};


let currentPortainerUpdatePromise = null;

const performPortainerUpdate = async ({ script, scriptSource, targetVersion }) => {
  let maintenanceActivated = false;
  const serverContextId = getActiveServerUrl() || null;

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

    logEvent({
      category: 'wartung',
      eventType: 'portainer-update',
      action: 'aktualisieren',
      status: 'gestartet',
      entityType: 'service',
      entityId: 'portainer',
      entityName: 'Portainer',
      contextType: serverContextId ? 'server' : null,
      contextId: serverContextId,
      message: `Portainer Update gestartet (Ziel: ${targetVersion ?? 'unbekannt'})`,
      metadata: {
        targetVersion: targetVersion ?? null,
        scriptSource
      },
      source: 'system'
    });

    logEvent({
      category: 'wartung',
      eventType: 'Wartungsmodus',
      action: 'aktivieren',
      status: 'gestartet',
      entityType: 'system',
      entityId: 'wartung',
      entityName: 'StackPulse Wartung',
      contextType: serverContextId ? 'server' : null,
      contextId: serverContextId,
      message: 'Wartungsmodus aktiviert (Portainer Update)',
      metadata: {
        reason: 'portainer-update',
        scriptSource
      },
      source: 'system'
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

    logEvent({
      category: 'wartung',
      eventType: 'portainer-update',
      action: 'aktualisieren',
      status: 'erfolgreich',
      entityType: 'service',
      entityId: 'portainer',
      entityName: 'Portainer',
      contextType: serverContextId ? 'server' : null,
      contextId: serverContextId,
      message: `Portainer Update abgeschlossen (Version: ${finalVersion ?? 'unbekannt'})`,
      metadata: {
        resultVersion: finalVersion ?? null
      },
      source: 'system'
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
      logEvent({
        category: 'wartung',
        eventType: 'Wartungsmodus',
        action: 'deaktivieren',
        status: 'erfolgreich',
        entityType: 'system',
        entityId: 'wartung',
        entityName: 'StackPulse Wartung',
        contextType: serverContextId ? 'server' : null,
        contextId: serverContextId,
        message: 'Wartungsmodus deaktiviert',
        metadata: {
          reason: 'portainer-update'
        },
        source: 'system'
      });
    }
  } catch (err) {
    const message = err?.message || 'Portainer Update fehlgeschlagen';
    logEvent({
      category: 'wartung',
      eventType: 'portainer-update',
      action: 'aktualisieren',
      status: 'fehler',
      entityType: 'service',
      entityId: 'portainer',
      entityName: 'Portainer',
      contextType: serverContextId ? 'server' : null,
      contextId: serverContextId,
      message,
      source: 'system'
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
      logEvent({
        category: 'wartung',
      eventType: 'Wartungsmodus',
      action: 'deaktivieren',
      status: 'fehler',
      entityType: 'system',
      entityId: 'wartung',
      entityName: 'StackPulse Wartung',
      contextType: serverContextId ? 'server' : null,
      contextId: serverContextId,
      message: 'Wartungsmodus deaktiviert (Fehler)',
      metadata: {
        reason: 'portainer-update'
      },
      source: 'system'
      });
    }
  } finally {
    currentPortainerUpdatePromise = null;
  }
};

const fetchPortainerStacks = async () => {
  const stacksRes = await axiosInstance.get('/api/stacks');
  return Array.isArray(stacksRes.data) ? stacksRes.data : [];
};

const buildStackCollections = (stacks = []) => {
  const currentSelfStackId = getSelfStackId();
  const collections = new Map();

  stacks.forEach((stack) => {
    const name = stack.Name || 'Unbenannt';
    const isSelf = currentSelfStackId && String(stack.Id) === currentSelfStackId;
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
  const currentSelfStackId = getSelfStackId();
  const results = await Promise.all(
    stacks.map(async (stack) => ({
      stack,
      outdated: currentSelfStackId && String(stack.Id) === currentSelfStackId
        ? false
        : await isStackOutdated(stack.Id)
    }))
  );

  return {
    eligibleStacks: results.filter((entry) => entry.outdated).map((entry) => entry.stack),
    skippedStacks: results.filter((entry) => !entry.outdated).map((entry) => entry.stack),
  };
};

const getRedeployMessages = (type) => {
  switch (type) {
    case REDEPLOY_TYPES.ALL:
      return { started: 'Redeploy ALL gestartet', success: 'Redeploy ALL abgeschlossen' };
    case REDEPLOY_TYPES.SELECTION:
      return { started: 'Redeploy Auswahl gestartet', success: 'Redeploy Auswahl abgeschlossen' };
    case REDEPLOY_TYPES.MAINTENANCE:
      return { started: 'Redeploy (Wartung) gestartet', success: 'Redeploy (Wartung) abgeschlossen' };
    default:
      return { started: 'Redeploy gestartet', success: 'Redeploy erfolgreich abgeschlossen' };
  }
};

const shouldFallbackToStackFile = (message) => {
  if (!message) return false;
  const normalized = String(message).toLowerCase();
  return normalized.includes('not created from git') || normalized.includes('no git configuration');
};

const redeployStackById = async (stackId, redeployType) => {
  let stack;
  const messages = getRedeployMessages(redeployType);

  try {
    const stackRes = await axiosInstance.get(`/api/stacks/${stackId}`);
    stack = stackRes.data;

    const targetId = stack.Id || stackId;
    const targetName = stack.Name || `Stack ${stackId}`;

    broadcastRedeployStatus({
      stackId: targetId,
      stackName: targetName,
      phase: REDEPLOY_PHASES.STARTED
    });

    logStackEvent({
      stackId: targetId,
      stackName: targetName,
      status: 'started',
      message: messages.started,
      redeployType
    });

    const redeployViaStackFile = async () => {
      const fileRes = await axiosInstance.get(`/api/stacks/${stack.Id}/file`);
      const stackFileContent = fileRes.data?.StackFileContent;
      if (!stackFileContent) {
        throw new Error('Stack file konnte nicht geladen werden');
      }

      if (stack.Type === 2) {
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
      }

      const updatePayload = {
        StackFileContent: stackFileContent,
        Prune: false,
        PullImage: true,
        Env: stack.Env || []
      };

      const swarmId = stack.SwarmId || stack.SwarmID || fileRes.data?.SwarmID;
      if (swarmId) {
        updatePayload.SwarmID = swarmId;
      }

      await axiosInstance.put(
        `/api/stacks/${stack.Id}`,
        updatePayload,
        { params: { endpointId: stack.EndpointId } }
      );
    };

    const isGitStack = Boolean(stack.GitConfig?.RepositoryURL);
    let gitRedeploySucceeded = false;

    if (isGitStack) {
      try {
        console.log(`🔄 [Redeploy] Git Stack "${stack.Name}" (${stack.Id}) wird redeployed`);
        await axiosInstance.put(`/api/stacks/${stack.Id}/git/redeploy?endpointId=${stack.EndpointId}`);
        gitRedeploySucceeded = true;
      } catch (err) {
        const gitErrorMessage = err.response?.data?.message || err.message;
        if (shouldFallbackToStackFile(gitErrorMessage)) {
          console.warn(`⚠️ Git Redeploy nicht möglich für Stack "${stack.Name}" (${stack.Id}): ${gitErrorMessage}. Fallback auf Stack-Datei.`);
        } else {
          throw err;
        }
      }
    }

    if (!gitRedeploySucceeded) {
      console.log(`🔄 [Redeploy] Stack "${stack.Name}" (${stack.Id}) wird über Stack-Datei redeployed`);
      await redeployViaStackFile();
    }

    broadcastRedeployStatus({
      stackId: targetId,
      stackName: targetName,
      phase: REDEPLOY_PHASES.SUCCESS
    });

    logStackEvent({
      stackId: targetId,
      stackName: targetName,
      status: 'success',
      message: messages.success,
      redeployType
    });

    return stack;
  } catch (err) {
    const errorMessage = err.response?.data?.message || err.message;
    const fallbackId = stack?.Id || stackId;
    const fallbackName = stack?.Name || `Stack ${stackId}`;

    broadcastRedeployStatus({
      stackId: fallbackId,
      stackName: fallbackName,
      phase: REDEPLOY_PHASES.ERROR,
      message: errorMessage
    });

    logStackEvent({
      stackId: fallbackId,
      stackName: fallbackName,
      status: 'error',
      message: errorMessage,
      redeployType
    });

    console.error(`❌ Fehler beim Redeploy von Stack ${fallbackName}:`, errorMessage);
    throw new Error(errorMessage);
  }
};

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) {
    return next();
  }

  if (req.method === 'OPTIONS' || isPublicApiRoute(req)) {
    return next();
  }

  if (!hasSuperuser()) {
    return res.status(403).json({ error: 'SUPERUSER_REQUIRED' });
  }

  if (!hasServer() || !hasApiKey()) {
    return res.status(403).json({ error: 'SETUP_REQUIRED' });
  }

  const token = extractAuthToken(req);
  const session = getSessionRecord(token);
  if (!session) {
    clearAuthCookie(res);
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const userRecord = getUserById(session.userId);
  if (!userRecord || !userRecord.isActive) {
    activeSessions.delete(token);
    clearAuthCookie(res);
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const userGroups = Array.isArray(userRecord.groups) ? userRecord.groups : [];
  const groupIds = userGroups
    .map((group) => Number(group.id))
    .filter((groupId) => Number.isFinite(groupId) && groupId > 0);

  const isSuperuser = userGroups.some(
    (group) => typeof group?.name === 'string' && group.name.toLowerCase() === SUPERUSER_GROUP_NAME
  );

  const permissionsMap = isSuperuser
    ? getSuperuserPermissionMap()
    : getEffectivePermissionsForGroups(groupIds);

  req.user = {
    id: userRecord.id,
    username: userRecord.username,
    email: userRecord.email,
    avatarColor: userRecord.avatarColor || null,
    groups: userGroups,
    isSuperuser,
    securityPhraseDownloadedAt: userRecord.securityPhraseDownloadedAt || null,
    requiresSecurityPhraseDownload: !userRecord.securityPhraseDownloadedAt
  };
  req.userPermissions = permissionsMap;
  req.authToken = token;
  touchSession(token);
  setAuthCookie(res, token);
  next();
});

// --- API Routes ---

app.get('/api/setup/status', (req, res) => {
  try {
    const status = buildSetupStatusResponse();
    res.json(status);
  } catch (error) {
    console.error('⚠️ [Setup] Statusabfrage fehlgeschlagen:', error);
    res.status(500).json({ error: 'SETUP_STATUS_FAILED' });
  }
});

app.post('/api/setup/test-portainer', async (req, res) => {
  const { serverUrl, apiKey } = extractPortainerCredentials(req.body);
  const normalizedUrl = normalizeExternalPortainerUrl(serverUrl);

  if (!normalizedUrl) {
    return res.status(400).json({ error: 'SERVER_URL_INVALID' });
  }
  if (!apiKey) {
    return res.status(400).json({ error: 'API_KEY_REQUIRED' });
  }

  try {
    const client = createPortainerSetupClient({ baseURL: normalizedUrl, apiKey });
    const statusRes = await client.get('/api/status');
    res.json({
      success: true,
      status: statusRes.data ?? null
    });
  } catch (error) {
    const message = error.response?.data?.message || error.message || 'PORTAINER_TEST_FAILED';
    const status = error.response?.status ?? 400;
    res.status(status === 401 ? 401 : 400).json({ error: 'PORTAINER_TEST_FAILED', message });
  }
});

app.post('/api/setup/portainer-stacks', async (req, res) => {
  const { serverUrl, apiKey } = extractPortainerCredentials(req.body);
  const normalizedUrl = normalizeExternalPortainerUrl(serverUrl);

  if (!normalizedUrl) {
    return res.status(400).json({ error: 'SERVER_URL_INVALID' });
  }
  if (!apiKey) {
    return res.status(400).json({ error: 'API_KEY_REQUIRED' });
  }

  try {
    const client = createPortainerSetupClient({ baseURL: normalizedUrl, apiKey });
    const stacksRes = await client.get('/api/stacks');
    const stacks = Array.isArray(stacksRes.data) ? stacksRes.data : [];
    res.json({ success: true, stacks });
  } catch (error) {
    const message = error.response?.data?.message || error.message || 'PORTAINER_STACK_FETCH_FAILED';
    const status = error.response?.status ?? 400;
    res.status(status === 401 ? 401 : 400).json({ error: 'PORTAINER_STACK_FETCH_FAILED', message });
  }
});

app.post('/api/setup/complete', (req, res) => {
  const { superuser: superuserInput, server: serverInput, apiKey: apiKeyInput, selfStackId: selfStackInput } = req.body ?? {};
  const hasSelfStackInput = req.body ? Object.prototype.hasOwnProperty.call(req.body, 'selfStackId') : false;
  const initialStatus = getSetupStatus();
  const needsSuperuser = initialStatus.requirements.superuser;
  const needsServer = initialStatus.requirements.server;
  const needsApiKey = initialStatus.requirements.apiKey;

  const created = {};

  const normalizeServerInput = (input) => {
    if (!input) return null;
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const url = typeof input.url === 'string' ? input.url.trim() : '';
    if (!url) {
      return { name: name || '', url: '' };
    }
    return {
      name: name || null,
      url
    };
  };

  const normalizeApiKeyInput = (input) => {
    if (!input) return null;
    if (typeof input === 'string') {
      const value = input.trim();
      return { value, serverId: null };
    }
    if (typeof input === 'object') {
      const rawValue = typeof input.value === 'string' ? input.value : typeof input.key === 'string' ? input.key : '';
      const value = rawValue.trim();
      const serverIdRaw = input.serverId !== undefined && input.serverId !== null ? Number(input.serverId) : null;
      const serverId = Number.isFinite(serverIdRaw) ? serverIdRaw : null;
      return { value, serverId };
    }
    return null;
  };

  try {
    const serverPayload = normalizeServerInput(serverInput);
    const apiKeyPayload = normalizeApiKeyInput(apiKeyInput);

    if (needsServer && (!serverPayload || !serverPayload.url)) {
      return res.status(400).json({ error: 'SERVER_DETAILS_REQUIRED' });
    }

    if (needsServer || (serverPayload && serverPayload.url)) {
      const setupResult = completeSetup({
        server: serverPayload && serverPayload.url ? serverPayload : null
      });
      created.server = setupResult.server;
    }

    if (needsSuperuser) {
      const username = typeof superuserInput?.username === 'string' ? superuserInput.username.trim() : '';
      const email = typeof superuserInput?.email === 'string' ? superuserInput.email.trim() : '';
      const password = typeof superuserInput?.password === 'string' ? superuserInput.password : '';

      if (!username || !email || !password) {
        return res.status(400).json({ error: 'SUPERUSER_DETAILS_REQUIRED' });
      }

      const user = registerSuperuser({ username, email, password });
      created.superuser = user;
    }

    const statusSnapshot = getSetupStatus();

    let targetServerId = apiKeyPayload?.serverId ?? created.server?.id ?? null;
    if (!targetServerId) {
      targetServerId = statusSnapshot.servers.items?.[0]?.id ?? null;
    }

    if (apiKeyPayload && apiKeyPayload.value) {
      if (!targetServerId) {
        return res.status(400).json({ error: 'SERVER_DETAILS_REQUIRED' });
      }
      const apiKeyResult = setServerApiKey({ serverId: targetServerId, apiKey: apiKeyPayload.value });
      created.apiKey = apiKeyResult;
    } else if (needsApiKey) {
      return res.status(400).json({ error: 'API_KEY_REQUIRED' });
    }

    if (hasSelfStackInput) {
      const normalizedSelfStackId = typeof selfStackInput === 'string'
        ? selfStackInput.trim()
        : selfStackInput !== undefined && selfStackInput !== null
          ? String(selfStackInput).trim()
          : '';

      const nextSelfStackId = persistSelfStackId(normalizedSelfStackId);
      created.selfStackId = nextSelfStackId || null;
    }

    const finalStatus = buildSetupStatusResponse();
    res.status(201).json({
      success: finalStatus.setupComplete,
      status: finalStatus,
      created
    });
  } catch (error) {
    const code = error.code || error.message;
    switch (code) {
      case 'SERVER_URL_REQUIRED':
      case 'SERVER_NAME_REQUIRED':
      case 'SERVER_DETAILS_REQUIRED':
      case 'USERNAME_REQUIRED':
      case 'EMAIL_INVALID':
      case 'PASSWORD_TOO_SHORT':
      case 'INVALID_PASSWORD':
      case 'API_KEY_REQUIRED':
        return res.status(400).json({ error: code });
      case 'API_KEY_ENCRYPT_FAILED':
        console.error('⚠️ [Setup] API-Key Verschlüsselung fehlgeschlagen:', error);
        return res.status(500).json({ error: 'API_KEY_ENCRYPT_FAILED' });
      case 'SERVER_NOT_FOUND':
        return res.status(404).json({ error: 'SERVER_NOT_FOUND' });
      case 'SUPERUSER_ALREADY_EXISTS':
        return res.status(409).json({ error: 'SUPERUSER_EXISTS' });
      default:
        console.error('⚠️ [Setup] Fehler beim Abschluss:', error);
        return res.status(500).json({ error: 'SETUP_FAILED' });
    }
  }
});

app.delete('/api/setup/servers/:id', requirePermission('maintenance-server-delete', 'full'), (req, res) => {
  const { id } = req.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return res.status(400).json({ error: 'SERVER_ID_INVALID' });
  }

  try {
    const result = removeServer(numericId);
    const status = buildSetupStatusResponse();
    res.json({ success: true, removed: result, status });
  } catch (error) {
    const code = error.code || error.message;
    switch (code) {
      case 'SERVER_ID_INVALID':
        return res.status(400).json({ error: 'SERVER_ID_INVALID' });
      case 'SERVER_NOT_FOUND':
        return res.status(404).json({ error: 'SERVER_NOT_FOUND' });
      default:
        console.error('⚠️ [Setup] Server konnte nicht gelöscht werden:', error);
        return res.status(500).json({ error: 'SERVER_DELETE_FAILED' });
    }
  }
});

app.put('/api/setup/servers/:id/api-key', requirePermission('maintenance-server-manage', 'full'), (req, res) => {
  const { id } = req.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return res.status(400).json({ error: 'SERVER_ID_INVALID' });
  }

  const rawValue = typeof req.body?.apiKey === 'string' ? req.body.apiKey : typeof req.body?.key === 'string' ? req.body.key : '';

  try {
    const result = setServerApiKey({ serverId: numericId, apiKey: rawValue });
    const status = buildSetupStatusResponse();
    res.json({ success: true, updated: result, status });
  } catch (error) {
    const code = error.code || error.message;
    switch (code) {
      case 'SERVER_ID_INVALID':
        return res.status(400).json({ error: 'SERVER_ID_INVALID' });
      case 'SERVER_NOT_FOUND':
        return res.status(404).json({ error: 'SERVER_NOT_FOUND' });
      case 'API_KEY_REQUIRED':
        return res.status(400).json({ error: 'API_KEY_REQUIRED' });
      case 'API_KEY_ENCRYPT_FAILED':
        console.error('⚠️ [Setup] API-Key Verschlüsselung fehlgeschlagen:', error);
        return res.status(500).json({ error: 'API_KEY_ENCRYPT_FAILED' });
      default:
        console.error('⚠️ [Setup] API-Key konnte nicht aktualisiert werden:', error);
        return res.status(500).json({ error: 'API_KEY_UPDATE_FAILED' });
    }
  }
});

app.put('/api/setup/self-stack', requirePermission('maintenance-server-manage', 'full'), (req, res) => {
  const hasPayload = req.body ? Object.prototype.hasOwnProperty.call(req.body, 'selfStackId') : false;
  if (!hasPayload) {
    return res.status(400).json({ error: 'SELF_STACK_ID_MISSING' });
  }

  const inputValue = req.body.selfStackId;
  const normalizedSelfStackId = typeof inputValue === 'string'
    ? inputValue.trim()
    : inputValue !== undefined && inputValue !== null
      ? String(inputValue).trim()
      : '';

  try {
    const nextValue = persistSelfStackId(normalizedSelfStackId) || null;
    const status = buildSetupStatusResponse();
    res.json({
      success: true,
      value: nextValue,
      status
    });
  } catch (error) {
    console.error('⚠️ [Setup] Self-Stack-ID konnte nicht aktualisiert werden:', error);
    res.status(500).json({ error: 'SELF_STACK_ID_UPDATE_FAILED' });
  }
});

app.post('/api/auth/login', (req, res) => {
  if (!hasSuperuser()) {
    return res.status(403).json({ error: 'SUPERUSER_REQUIRED' });
  }

  if (!hasServer() || !hasApiKey()) {
    return res.status(403).json({ error: 'SETUP_REQUIRED' });
  }

  const { identifier, password } = req.body ?? {};
  if (!identifier || !password) {
    return res.status(400).json({ error: 'MISSING_CREDENTIALS' });
  }

  const user = findUserByIdentifier(identifier);
  if (!user) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }

  if (!user.is_active) {
    return res.status(403).json({ error: 'USER_INACTIVE' });
  }

  const passwordValid = verifyPassword(password, user.password_hash, user.password_salt);
  if (!passwordValid) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }

  const session = createSessionForUser(user);
  markUserLogin(user.id);
  setAuthCookie(res, session.token);

  const payload = buildUserSessionPayload(user.id);
  if (payload) {
    res.json(payload);
  } else {
    res.json({ user: sanitizeUser(user), permissions: {} });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = extractAuthToken(req);
  if (token) {
    activeSessions.delete(token);
  }
  clearAuthCookie(res);
  res.json({ success: true });
});

app.post('/api/auth/recover/verify', (req, res) => {
  const { username, phrase, words } = req.body ?? {};

  try {
    const candidate = typeof phrase === 'string' && phrase.trim() ? phrase : words;
    const verification = verifySecurityPhraseForUsername(username, candidate);
    const ticket = createPasswordResetTicketForUser(verification.userId);
    res.json({ token: ticket.token, expiresIn: PASSWORD_RESET_TTL_MS });
  } catch (error) {
    if (error.code === 'USERNAME_REQUIRED' || error.code === 'PHRASE_REQUIRED') {
      return res.status(400).json({ error: error.code });
    }
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    if (error.code === 'PHRASE_NOT_INITIALIZED') {
      return res.status(409).json({ error: 'PHRASE_NOT_INITIALIZED' });
    }
    if (error.code === 'PHRASE_MISMATCH') {
      return res.status(401).json({ error: 'PHRASE_MISMATCH' });
    }
    if (error.code === 'INVALID_PASSWORD') {
      return res.status(400).json({ error: 'INVALID_PASSWORD' });
    }
    console.error('⚠️ [Auth] Sicherheitsphrase-Überprüfung fehlgeschlagen:', error);
    res.status(500).json({ error: 'RECOVERY_VERIFY_FAILED' });
  }
});

app.post('/api/auth/recover/reset', (req, res) => {
  const { token, password, confirmPassword } = req.body ?? {};

  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ error: 'TOKEN_REQUIRED' });
  }

  if (typeof password !== 'string' || !password.trim()) {
    return res.status(400).json({ error: 'PASSWORD_REQUIRED' });
  }

  if (typeof confirmPassword === 'string' && password !== confirmPassword) {
    return res.status(400).json({ error: 'PASSWORD_MISMATCH' });
  }

  const trimmedToken = token.trim();
  const ticket = getPasswordResetTicket(trimmedToken);
  if (!ticket) {
    return res.status(410).json({ error: 'TOKEN_INVALID_OR_EXPIRED' });
  }

  try {
    setUserPassword(ticket.userId, password, { resetMethod: 'security-phrase' });
    passwordResetTickets.delete(trimmedToken);
    removeSessionsForUser(ticket.userId);
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'INVALID_PASSWORD' || error.code === 'PASSWORD_TOO_SHORT') {
      return res.status(400).json({ error: error.code });
    }
    if (error.code === 'USER_NOT_FOUND') {
      passwordResetTickets.delete(trimmedToken);
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    console.error('⚠️ [Auth] Passwort-Zurücksetzung fehlgeschlagen:', error);
    res.status(500).json({ error: 'RECOVERY_RESET_FAILED' });
  }
});

app.get('/api/auth/session', (req, res) => {
  if (!hasSuperuser()) {
    return res.status(403).json({ error: 'SUPERUSER_REQUIRED' });
  }

  if (!hasServer() || !hasApiKey()) {
    return res.status(403).json({ error: 'SETUP_REQUIRED' });
  }

  const token = extractAuthToken(req);
  const session = getSessionRecord(token);
  if (!session) {
    clearAuthCookie(res);
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const payload = buildUserSessionPayload(session.userId);
  if (!payload) {
    activeSessions.delete(token);
    clearAuthCookie(res);
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  touchSession(token);
  setAuthCookie(res, token);
  res.json(payload);
});

app.get('/api/users', requirePermission('users-access', 'read'), (req, res) => {
  try {
    const users = listUsers();
    res.json({ items: users, total: users.length });
  } catch (error) {
    console.error('⚠️ [Users] Abruf der Benutzerliste fehlgeschlagen:', error);
    res.status(500).json({ error: 'USERS_FETCH_FAILED' });
  }
});

app.post('/api/users', requirePermission('users-edit', 'full'), (req, res) => {
  const { username, email, password, groupId, avatarColor } = req.body ?? {};

  try {
    const user = createUser({ username, email, password, groupId, avatarColor }, { actor: req.user });
    res.status(201).json({ item: user });
  } catch (error) {
    if (error.code === 'USERNAME_REQUIRED' || error.code === 'INVALID_GROUP_ID') {
      return res.status(400).json({ error: error.code });
    }
    if (error.code === 'GROUP_NOT_FOUND') {
      return res.status(400).json({ error: 'GROUP_NOT_FOUND' });
    }
    if (error.code === 'INVALID_EMAIL') {
      return res.status(400).json({ error: 'INVALID_EMAIL' });
    }
    if (error.code === 'INVALID_PASSWORD' || error.code === 'PASSWORD_TOO_SHORT') {
      return res.status(400).json({ error: error.code });
    }
    if (error.code === 'USERNAME_TAKEN' || error.code === 'EMAIL_TAKEN') {
      return res.status(409).json({ error: error.code });
    }
    console.error('⚠️ [Users] Anlegen eines Benutzers fehlgeschlagen:', error);
    res.status(500).json({ error: 'USER_CREATE_FAILED' });
  }
});

app.get('/api/users/me/security-phrase', (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  try {
    const phrase = getUserSecurityPhrase(userId, { actor: req.user });
    if (phrase.downloadedAt) {
      return res.status(409).json({
        error: 'SECURITY_PHRASE_ALREADY_DOWNLOADED',
        downloadedAt: phrase.downloadedAt
      });
    }
    res.json({
      item: {
        userId: phrase.userId,
        words: phrase.words,
        downloadedAt: phrase.downloadedAt
      }
    });
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    console.error(`⚠️ [Users] Sicherheitsschlüssel konnte für Benutzer ${userId} nicht geladen werden:`, error);
    res.status(500).json({ error: 'USER_SECURITY_PHRASE_FETCH_FAILED' });
  }
});

app.post('/api/users/me/security-phrase/downloaded', (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  try {
    const result = markSecurityPhraseDownloaded(userId, { actor: req.user });
    const sessionPayload = buildUserSessionPayload(userId);
    res.json({
      item: {
        userId: result.userId,
        downloadedAt: result.downloadedAt
      },
      session: sessionPayload
    });
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    console.error(`⚠️ [Users] Sicherheits-Download konnte nicht vermerkt werden (${userId}):`, error);
    res.status(500).json({ error: 'USER_SECURITY_PHRASE_DOWNLOAD_FAILED' });
  }
});

app.get('/api/users/:userId', requirePermission('users-access', 'read'), (req, res) => {
  const { userId } = req.params;
  const numericId = Number(userId);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return res.status(400).json({ error: 'INVALID_USER_ID' });
  }

  try {
    const user = getUserById(numericId);
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    res.json({ item: user });
  } catch (error) {
    console.error(`⚠️ [Users] Abruf der Benutzerdetails fehlgeschlagen (${userId}):`, error);
    res.status(500).json({ error: 'USER_FETCH_FAILED' });
  }
});

app.get('/api/users/:userId/security-phrase', requirePermission('users-security-phrase', 'read'), (req, res) => {
  const { userId } = req.params;
  const numericId = Number(userId);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return res.status(400).json({ error: 'INVALID_USER_ID' });
  }

  try {
    const phrase = getUserSecurityPhrase(numericId, { actor: req.user });
    res.json({ item: phrase });
  } catch (error) {
    if (error.code === 'INVALID_USER_ID') {
      return res.status(400).json({ error: 'INVALID_USER_ID' });
    }
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    console.error(`⚠️ [Users] Sicherheitsschlüssel konnte nicht geladen werden (${userId}):`, error);
    res.status(500).json({ error: 'USER_SECURITY_PHRASE_FETCH_FAILED' });
  }
});

app.post('/api/users/:userId/security-phrase/renew', requirePermission('users-security-phrase', 'full'), (req, res) => {
  const { userId } = req.params;
  const numericId = Number(userId);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return res.status(400).json({ error: 'INVALID_USER_ID' });
  }

  try {
    const renewed = renewUserSecurityPhrase(numericId, { actor: req.user });
    res.json({ item: renewed });
  } catch (error) {
    if (error.code === 'INVALID_USER_ID') {
      return res.status(400).json({ error: 'INVALID_USER_ID' });
    }
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    console.error(`⚠️ [Users] Sicherheitsschlüssel konnte nicht erneuert werden (${userId}):`, error);
    res.status(500).json({ error: 'USER_SECURITY_PHRASE_RENEW_FAILED' });
  }
});

app.put('/api/users/:userId', requirePermission('users-edit', 'full'), (req, res) => {
  const { userId } = req.params;
  const numericId = Number(userId);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return res.status(400).json({ error: 'INVALID_USER_ID' });
  }

  const { username, email, password, avatarColor, groupId, groupIds } = req.body ?? {};

  try {
    const updatedUser = updateUserDetails(numericId, {
      username,
      email,
      password,
      avatarColor,
      groupId,
      groupIds
    });
    res.json({ item: updatedUser });
  } catch (error) {
    if (error.code === 'INVALID_USER_ID') {
      return res.status(400).json({ error: 'INVALID_USER_ID' });
    }
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    if (error.code === 'USERNAME_REQUIRED') {
      return res.status(400).json({ error: 'USERNAME_REQUIRED' });
    }
    if (error.code === 'INVALID_EMAIL') {
      return res.status(400).json({ error: 'INVALID_EMAIL' });
    }
    if (error.code === 'USERNAME_TAKEN') {
      return res.status(409).json({ error: 'USERNAME_TAKEN' });
    }
    if (error.code === 'EMAIL_TAKEN') {
      return res.status(409).json({ error: 'EMAIL_TAKEN' });
    }
    if (error.code === 'INVALID_PASSWORD' || error.code === 'PASSWORD_TOO_SHORT') {
      return res.status(400).json({ error: error.code });
    }
    if (error.code === 'INVALID_AVATAR_COLOR') {
      return res.status(400).json({ error: 'INVALID_AVATAR_COLOR' });
    }
    if (error.code === 'GROUP_NOT_FOUND') {
      return res.status(400).json({ error: 'GROUP_NOT_FOUND', details: error.missingGroupIds || [] });
    }
    if (error.code === 'GROUP_SUPERUSER_PROTECTED') {
      return res.status(403).json({ error: 'GROUP_SUPERUSER_PROTECTED' });
    }

    console.error(`⚠️ [Users] Aktualisierung der Benutzerdaten fehlgeschlagen (${userId}):`, error);
    res.status(500).json({ error: 'USER_UPDATE_FAILED' });
  }
});

app.put('/api/users/:userId/groups', requirePermission('users-edit', 'full'), (req, res) => {
  const { userId } = req.params;
  const numericId = Number(userId);
  const { groupIds } = req.body ?? {};

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return res.status(400).json({ error: 'INVALID_USER_ID' });
  }

  try {
    const updatedUser = updateUserGroups(numericId, Array.isArray(groupIds) ? groupIds : []);
    res.json({ item: updatedUser });
  } catch (error) {
    if (error.code === 'INVALID_USER_ID') {
      return res.status(400).json({ error: 'INVALID_USER_ID' });
    }
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    if (error.code === 'GROUP_NOT_FOUND') {
      return res.status(400).json({ error: 'GROUP_NOT_FOUND', details: error.missingGroupIds || [] });
    }
    console.error(`⚠️ [Users] Aktualisierung der Gruppenzuordnung fehlgeschlagen (${userId}):`, error);
    res.status(500).json({ error: 'USER_GROUPS_UPDATE_FAILED' });
  }
});

app.delete('/api/users/:userId', requirePermission('users-delete', 'full'), (req, res) => {
  const { userId } = req.params;
  const numericId = Number(userId);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return res.status(400).json({ error: 'INVALID_USER_ID' });
  }

  try {
    deleteUser(numericId);
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'INVALID_USER_ID') {
      return res.status(400).json({ error: 'INVALID_USER_ID' });
    }
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    if (error.code === 'USER_SUPERUSER_PROTECTED') {
      return res.status(403).json({ error: 'USER_SUPERUSER_PROTECTED' });
    }

    console.error(`⚠️ [Users] Löschen fehlgeschlagen (${userId}):`, error);
    res.status(500).json({ error: 'USER_DELETE_FAILED' });
  }
});

app.put('/api/users/:userId/active', requirePermission('users-edit', 'full'), (req, res) => {
  const { userId } = req.params;
  const numericId = Number(userId);
  const { isActive } = req.body ?? {};

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return res.status(400).json({ error: 'INVALID_USER_ID' });
  }

  try {
    const updatedUser = updateUserActiveStatus(numericId, Boolean(isActive));
    res.json({ item: updatedUser });
  } catch (error) {
    if (error.code === 'INVALID_USER_ID') {
      return res.status(400).json({ error: 'INVALID_USER_ID' });
    }
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    if (error.code === 'USER_SUPERUSER_PROTECTED') {
      return res.status(403).json({ error: 'USER_SUPERUSER_PROTECTED' });
    }

    console.error(`⚠️ [Users] Aktualisierung des Aktivstatus fehlgeschlagen (${userId}):`, error);
    res.status(500).json({ error: 'USER_STATUS_UPDATE_FAILED' });
  }
});

app.get(
  '/api/groups',
  requireAnyPermission([
    { key: 'user-groups-access', level: 'read' },
    { key: 'users-edit', level: 'read' }
  ]),
  (req, res) => {
  try {
    const groups = listGroups();
    res.json({ items: groups, total: groups.length });
  } catch (error) {
    console.error('⚠️ [Groups] Abruf der Benutzergruppenliste fehlgeschlagen:', error);
    res.status(500).json({ error: 'GROUPS_FETCH_FAILED' });
  }
  }
);

app.get(
  '/api/groups/:groupId',
  requireAnyPermission([
    { key: 'user-groups-access', level: 'read' },
    { key: 'users-edit', level: 'read' }
  ]),
  (req, res) => {
  const { groupId } = req.params;
  const numericId = Number(groupId);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return res.status(400).json({ error: 'INVALID_GROUP_ID' });
  }

  try {
    const group = getGroupById(numericId);
    if (!group) {
      return res.status(404).json({ error: 'GROUP_NOT_FOUND' });
    }
    res.json({ item: group });
  } catch (error) {
    console.error(`⚠️ [Groups] Abruf der Gruppendetails fehlgeschlagen (${groupId}):`, error);
    res.status(500).json({ error: 'GROUP_FETCH_FAILED' });
  }
  }
);

app.get('/api/groups/:groupId/permissions', requirePermission('user-groups-edit', 'read'), (req, res) => {
  const { groupId } = req.params;
  const numericId = Number(groupId);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return res.status(400).json({ error: 'INVALID_GROUP_ID' });
  }

  try {
    const group = getGroupById(numericId);
    if (!group) {
      return res.status(404).json({ error: 'GROUP_NOT_FOUND' });
    }

    const sections = getPermissionStructure();
    const isSuperuser = (group.name || '').toLowerCase() === SUPERUSER_GROUP_NAME;
    let values = {};

    if (isSuperuser) {
      clearGroupPermissionValues(numericId);
    } else {
      values = getPermissionValuesByGroup(numericId);
    }

    res.json({ sections, values });
  } catch (error) {
    console.error(`⚠️ [Groups] Abruf der Gruppenberechtigungen fehlgeschlagen (${groupId}):`, error);
    res.status(500).json({ error: 'GROUP_PERMISSIONS_FETCH_FAILED' });
  }
});

app.put('/api/groups/:groupId/permissions', requirePermission('user-groups-edit', 'full'), (req, res) => {
  const { groupId } = req.params;
  const numericId = Number(groupId);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return res.status(400).json({ error: 'INVALID_GROUP_ID' });
  }

  try {
    const group = getGroupById(numericId);
    if (!group) {
      return res.status(404).json({ error: 'GROUP_NOT_FOUND' });
    }

    const isSuperuser = (group.name || '').toLowerCase() === SUPERUSER_GROUP_NAME;
    if (isSuperuser) {
      clearGroupPermissionValues(numericId);
      return res.status(403).json({ error: 'GROUP_SUPERUSER_PROTECTED' });
    }

    const valuesPayload = req.body?.values ?? {};
    const savedValues = saveGroupPermissionValues(numericId, valuesPayload);

    res.json({ success: true, values: savedValues });
  } catch (error) {
    const serverError = error?.code;
    if (serverError === 'GROUP_NOT_FOUND') {
      return res.status(404).json({ error: 'GROUP_NOT_FOUND' });
    }
    if (serverError === 'PERMISSION_INVALID_PAYLOAD') {
      return res.status(400).json({ error: 'PERMISSION_INVALID_PAYLOAD' });
    }
    if (serverError === 'PERMISSION_INVALID_LEVEL') {
      return res.status(400).json({ error: 'PERMISSION_INVALID_LEVEL', permissionKey: error.permissionKey, level: error.level });
    }
    if (serverError === 'PERMISSION_UNKNOWN_KEY') {
      return res.status(400).json({ error: 'PERMISSION_UNKNOWN_KEY', permissionKey: error.permissionKey });
    }
    if (serverError === 'INVALID_GROUP_ID') {
      return res.status(400).json({ error: 'INVALID_GROUP_ID' });
    }

    console.error(`⚠️ [Groups] Aktualisierung der Berechtigungen fehlgeschlagen (${groupId}):`, error);
    res.status(500).json({ error: 'GROUP_PERMISSIONS_UPDATE_FAILED' });
  }
});

app.post('/api/groups', requirePermission('user-groups-edit', 'full'), (req, res) => {
  const { name, description } = req.body ?? {};
  try {
    const group = createGroup({ name, description });
    res.status(201).json({ item: group });
  } catch (error) {
    if (error.code === 'GROUP_NAME_REQUIRED') {
      return res.status(400).json({ error: 'GROUP_NAME_REQUIRED' });
    }
    if (error.code === 'GROUP_NAME_TAKEN') {
      return res.status(409).json({ error: 'GROUP_NAME_TAKEN' });
    }
    console.error('⚠️ [Groups] Anlegen der Benutzergruppe fehlgeschlagen:', error);
    res.status(500).json({ error: 'GROUP_CREATE_FAILED' });
  }
});

app.put('/api/groups/:groupId', requirePermission('user-groups-edit', 'full'), (req, res) => {
  const { groupId } = req.params;
  const numericId = Number(groupId);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return res.status(400).json({ error: 'INVALID_GROUP_ID' });
  }

  const { name, description, avatarColor } = req.body ?? {};

  try {
    const updatedGroup = updateGroupDetails(numericId, { name, description, avatarColor });
    res.json({ item: updatedGroup });
  } catch (error) {
    if (error.code === 'INVALID_GROUP_ID') {
      return res.status(400).json({ error: 'INVALID_GROUP_ID' });
    }
    if (error.code === 'GROUP_NOT_FOUND') {
      return res.status(404).json({ error: 'GROUP_NOT_FOUND' });
    }
    if (error.code === 'GROUP_NAME_REQUIRED') {
      return res.status(400).json({ error: 'GROUP_NAME_REQUIRED' });
    }
    if (error.code === 'GROUP_NAME_TAKEN') {
      return res.status(409).json({ error: 'GROUP_NAME_TAKEN' });
    }
    if (error.code === 'INVALID_AVATAR_COLOR') {
      return res.status(400).json({ error: 'INVALID_AVATAR_COLOR' });
    }
    if (error.code === 'GROUP_SUPERUSER_PROTECTED') {
      return res.status(403).json({ error: 'GROUP_SUPERUSER_PROTECTED' });
    }

    console.error(`⚠️ [Groups] Aktualisierung der Gruppendaten fehlgeschlagen (${groupId}):`, error);
    res.status(500).json({ error: 'GROUP_UPDATE_FAILED' });
  }
});

app.delete('/api/groups/:groupId', requirePermission('user-groups-delete', 'full'), (req, res) => {
  const { groupId } = req.params;
  const numericId = Number(groupId);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return res.status(400).json({ error: 'INVALID_GROUP_ID' });
  }

  try {
    deleteGroup(numericId);
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'INVALID_GROUP_ID') {
      return res.status(400).json({ error: 'INVALID_GROUP_ID' });
    }
    if (error.code === 'GROUP_NOT_FOUND') {
      return res.status(404).json({ error: 'GROUP_NOT_FOUND' });
    }
    if (error.code === 'GROUP_HAS_MEMBERS') {
      return res.status(409).json({ error: 'GROUP_HAS_MEMBERS', memberCount: error.memberCount || 0 });
    }
    if (error.code === 'GROUP_SUPERUSER_PROTECTED') {
      return res.status(403).json({ error: 'GROUP_SUPERUSER_PROTECTED' });
    }

    console.error(`⚠️ [Groups] Löschen der Gruppe fehlgeschlagen (${groupId}):`, error);
    res.status(500).json({ error: 'GROUP_DELETE_FAILED' });
  }
});

// Superuser Setup
app.get('/api/auth/superuser/status', (req, res) => {
  const exists = hasSuperuser();
  const user = exists ? getSuperuserSummary() : null;
  res.json({ exists, user });
});

app.post('/api/auth/superuser/register', (req, res) => {
  if (hasSuperuser()) {
    return res.status(409).json({ error: 'SUPERUSER_EXISTS' });
  }

  const { username, email, password } = req.body || {};

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'MISSING_FIELDS' });
  }

  try {
    const user = registerSuperuser({ username, email, password });
    res.status(201).json({ user });
  } catch (error) {
    switch (error.code) {
      case 'USERNAME_REQUIRED':
        return res.status(400).json({ error: 'USERNAME_REQUIRED' });
      case 'EMAIL_INVALID':
        return res.status(400).json({ error: 'EMAIL_INVALID' });
      case 'PASSWORD_TOO_SHORT':
        return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
      case 'SUPERUSER_ALREADY_EXISTS':
        return res.status(409).json({ error: 'SUPERUSER_EXISTS' });
      default:
        console.error('⚠️ Fehler beim Registrieren des Superusers:', error);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
});

app.delete('/api/auth/superuser', requirePermission('maintenance-superuser-delete', 'full'), (req, res) => {
  if (!hasSuperuser()) {
    return res.status(404).json({ error: 'SUPERUSER_NOT_FOUND' });
  }

  try {
    const result = removeSuperuser();
    res.json({ success: true, usersRemoved: result.usersRemoved, groupRemoved: result.groupRemoved });
  } catch (error) {
    if (error.code === 'SUPERUSER_NOT_FOUND') {
      return res.status(404).json({ error: 'SUPERUSER_NOT_FOUND' });
    }
    console.error('⚠️ Fehler beim Löschen des Superusers:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

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

    const currentSelfStackId = getSelfStackId();
    const stacksWithStatus = await Promise.all(
      canonicalStacks.map(async (stack) => {
        try {
          const statusRes = await axiosInstance.get(
            `/api/stacks/${stack.Id}/images_status?refresh=true`
          );
          const statusEmoji = statusRes.data.Status === 'outdated' ? '⚠️' : '✅';
          const redeployMeta = redeployingStacks.get(String(stack.Id));
          const redeployPhase = redeployMeta?.phase || null;
          return {
            ...stack,
            updateStatus: statusEmoji,
            redeploying: redeployPhase === REDEPLOY_PHASES.STARTED || redeployPhase === REDEPLOY_PHASES.QUEUED,
            redeployPhase,
            redeployQueued: redeployPhase === REDEPLOY_PHASES.QUEUED,
            redeployDisabled: currentSelfStackId ? String(stack.Id) === currentSelfStackId : false,
            duplicateName: duplicateNameSet.has(stack.Name)
          };
        } catch (err) {
          console.error(`❌ Fehler beim Abrufen des Status für Stack ${stack.Id}:`, err.message);
          const redeployMeta = redeployingStacks.get(String(stack.Id));
          const redeployPhase = redeployMeta?.phase || null;
          return {
            ...stack,
            updateStatus: '❌',
            redeploying: redeployPhase === REDEPLOY_PHASES.STARTED || redeployPhase === REDEPLOY_PHASES.QUEUED,
            redeployPhase,
            redeployQueued: redeployPhase === REDEPLOY_PHASES.QUEUED,
            redeployDisabled: currentSelfStackId ? String(stack.Id) === currentSelfStackId : false,
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
    if (err.message === 'PORTAINER_URL_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'PORTAINER_URL_NOT_CONFIGURED' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/maintenance/portainer-status', requirePermission('maintenance-portainer', 'read'), async (req, res) => {
  console.log("🧭 [Maintenance] GET /api/maintenance/portainer-status: Prüfung gestartet");
  try {
    const payload = await fetchPortainerStatusSummary();
    res.json(payload);
  } catch (err) {
    const message = err.response?.data?.message || err.message || 'Unbekannter Fehler';
    console.error(`❌ [Maintenance] Fehler beim Prüfen des Portainer-Status: ${message}`);
    if (message === 'PORTAINER_URL_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'PORTAINER_URL_NOT_CONFIGURED' });
    }
    res.status(500).json({ error: message });
  }
});

app.post('/api/maintenance/mode', requirePermission('maintenance-access', 'full'), (req, res) => {
  try {
    const { active, message } = req.body ?? {};
    const normalizedMessage = typeof message === 'string' && message.trim() ? message.trim() : null;
    const nextState = active
      ? activateMaintenanceMode({ message: normalizedMessage })
      : deactivateMaintenanceMode({ message: normalizedMessage });

    res.json({
      success: true,
      maintenance: nextState
    });
  } catch (err) {
    const errorMessage = err.response?.data?.error || err.message || 'Fehler beim Aktualisieren des Wartungsmodus';
    console.error('❌ [Maintenance] Fehler beim Ändern des Wartungsmodus:', errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/maintenance/config', requirePermission('maintenance-server-manage', 'read'), (req, res) => {
  const custom = getCustomPortainerScript();
  const effective = getEffectivePortainerScript();
  const ssh = getPortainerSshConfig();

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
    },
    ssh: {
      host: ssh.host,
      port: ssh.port,
      username: ssh.username,
      extraSshArgs: ssh.extraSshArgs,
      passwordStored: Boolean(ssh.password)
    }
  });
});

app.put('/api/maintenance/ssh-config', requirePermission('maintenance-ssh-update', 'full'), (req, res) => {
  try {
    const config = savePortainerSshConfig(req.body || {});
    res.json({
      success: true,
      ssh: {
        host: config.host,
        port: config.port,
        username: config.username,
        extraSshArgs: config.extraSshArgs,
        passwordStored: Boolean(config.password)
      }
    });
  } catch (err) {
    console.error('❌ [Maintenance] Fehler beim Speichern der SSH-Konfiguration:', err.message);
    res.status(400).json({ error: err.message || 'Ungültige SSH-Konfiguration' });
  }
});

app.delete('/api/maintenance/ssh-config', requirePermission('maintenance-ssh-update', 'full'), (req, res) => {
  const config = deletePortainerSshConfig();
  res.json({
    success: true,
    ssh: {
      host: config.host,
      port: config.port,
      username: config.username,
      extraSshArgs: config.extraSshArgs,
      passwordStored: false
    }
  });
});

app.post('/api/maintenance/test-ssh', requirePermission('maintenance-ssh-update', 'full'), async (req, res) => {
  try {
    const override = req.body && Object.keys(req.body).length ? req.body : null;
    const result = await testSshConnection(override);
    res.json({ success: true, result });
  } catch (err) {
    console.error('❌ [Maintenance] SSH Test fehlgeschlagen:', err.message);
    res.status(500).json({ error: err.message || 'SSH Test fehlgeschlagen' });
  }
});

app.put('/api/maintenance/update-script', requirePermission('maintenance-ssh-update', 'full'), (req, res) => {
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

app.delete('/api/maintenance/update-script', requirePermission('maintenance-ssh-update', 'full'), (req, res) => {
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

app.get('/api/maintenance/update-status', requirePermission('maintenance-update', 'read'), (req, res) => {
  res.json({
    maintenance: getMaintenanceState(),
    update: getPortainerUpdateStatus()
  });
});

app.post('/api/maintenance/portainer-update', requirePermission('maintenance-update', 'full'), async (req, res) => {
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

app.get(
  '/api/maintenance/duplicates',
  maintenanceGuard,
  requirePermission('maintenance-duplicates', 'read'),
  async (req, res) => {
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

app.post(
  '/api/maintenance/duplicates/cleanup',
  maintenanceGuard,
  requirePermission('maintenance-duplicates', 'full'),
  async (req, res) => {
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

    logStackEvent({
      stackId: target.canonical.Id,
      stackName: target.canonical.Name,
      status: 'started',
      message: `Bereinigung doppelter Stacks gestartet (${duplicatesToDelete.length} Einträge)`,
      redeployType: REDEPLOY_TYPES.MAINTENANCE,
      metadata: {
        duplicateIds: duplicateIds
      }
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
          status: 'deleted'
        });
      } catch (err) {
        const message = err.response?.data?.message || err.message;
        console.error(`❌ [Maintenance] Fehler beim Entfernen von Stack ${stack.Id}:`, message);
        errors.push({ id: stack.Id, message });
        results.push({
          id: stack.Id,
          name: stack.Name,
          status: 'error',
          message
        });
      }
    }

    if (errors.length) {
      const failedIds = errors.map((entry) => entry.id).join(', ');
      logStackEvent({
        stackId: target.canonical.Id,
        stackName: target.canonical.Name,
        status: 'error',
        message: `Bereinigung fehlgeschlagen für IDs: ${failedIds}`,
        redeployType: REDEPLOY_TYPES.MAINTENANCE,
        metadata: {
          duplicateIds: duplicateIds
        }
      });

      return res.status(500).json({
        success: false,
        canonical: {
          id: target.canonical.Id,
          name: target.canonical.Name
        },
        results
      });
    }

    logStackEvent({
      stackId: target.canonical.Id,
      stackName: target.canonical.Name,
      status: 'success',
      message: `Bereinigung abgeschlossen. Entfernte IDs: ${results.map((entry) => entry.id).join(', ')}`,
      redeployType: REDEPLOY_TYPES.MAINTENANCE,
      metadata: {
        removedDuplicates: results.filter((entry) => entry.status === 'deleted').map((entry) => entry.id)
      }
    });

    res.json({
      success: true,
      canonical: {
        id: target.canonical.Id,
        name: target.canonical.Name
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

// Event-Logs abrufen
app.get('/api/logs', requirePermission('logs-access', 'read'), (req, res) => {
  const perPageParam = req.query.perPage ?? req.query.limit;
  const perPage = perPageParam === 'all' ? 'all' : Math.min(parseInt(perPageParam, 10) || 50, 500);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  const limit = perPage === 'all' ? undefined : perPage;
  const offset = perPage === 'all' ? 0 : (page - 1) * perPage;

  const { whereClause, params } = buildEventLogFilter(req.query);
  const baseQuery = `
    SELECT
      id,
      timestamp,
      category,
      event_type AS eventType,
      action,
      status,
      severity,
      entity_type AS entityType,
      entity_id AS entityId,
      entity_name AS entityName,
      actor_type AS actorType,
      actor_id AS actorId,
      actor_name AS actorName,
      source,
      context_type AS contextType,
      context_id AS contextId,
      context_label AS contextLabel,
      message,
      metadata
    FROM event_logs
    ${whereClause}
    ORDER BY datetime(timestamp) DESC
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM event_logs
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
    const rawLogs = stmt.all(params);
    const logs = rawLogs.map((row) => {
      const metadata = parseJsonColumn(row.metadata);
      const legacyStack = row.entityType === 'stack' ? (row.entityId ?? null) : null;
      const legacyStackName = row.entityType === 'stack' ? (row.entityName ?? row.entityId ?? null) : null;
      const serverContext = row.contextType === 'server'
        ? (row.contextId ?? null)
        : null;

      return {
        ...row,
        entityId: row.entityId ?? null,
        actorId: row.actorId ?? null,
        contextId: row.contextId ?? null,
        metadata,
        stackId: legacyStack,
        stackName: legacyStackName,
        redeployType: row.eventType ?? null,
        server: serverContext
      };
    });
    const total = db.prepare(countQuery).get(params)?.total ?? logs.length;

    res.json({
      total,
      items: logs,
      page,
      perPage: perPage === 'all' ? 'all' : limit
    });
  } catch (err) {
    console.error('❌ Fehler beim Abrufen der Event-Logs:', err.message);
    res.status(500).json({ error: 'Fehler beim Abrufen der Logs' });
  }
});

app.delete('/api/logs/:id', requirePermission('logs-delete', 'full'), (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Ungültige ID' });
  }

  try {
    const changes = deleteEventLogById(id);
    if (!changes) {
      return res.status(404).json({ error: 'Eintrag nicht gefunden' });
    }
    res.json({ success: true, deleted: changes });
  } catch (err) {
    console.error('❌ Fehler beim Löschen des Event-Logs:', err.message);
    res.status(500).json({ error: 'Fehler beim Löschen des Logs' });
  }
});

app.delete('/api/logs', requirePermission('logs-delete', 'full'), (req, res) => {
  try {
    const deleted = deleteEventLogsByFilters(req.query);
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('❌ Fehler beim Löschen der Event-Logs:', err.message);
    res.status(500).json({ error: 'Fehler beim Löschen der Logs' });
  }
});

app.get('/api/logs/export', requirePermission('logs-export', 'full'), (req, res) => {
  const format = (req.query.format || 'txt').toLowerCase();
  if (!['txt', 'sql'].includes(format)) {
    return res.status(400).json({ error: 'Ungültiges Export-Format' });
  }

  try {
    const payload = exportEventLogsByFilters(req.query, format);
    res.setHeader('Content-Type', payload.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
    res.send(payload.content);
  } catch (err) {
    console.error('❌ Fehler beim Export der Event-Logs:', err.message);
    res.status(500).json({ error: 'Fehler beim Export der Logs' });
  }
});

// Einzel-Redeploy
app.put('/api/stacks/:id/redeploy', requirePermission('stacks-redeploy-single', 'full'), async (req, res) => {
  const { id } = req.params;
  console.log(`🔄 PUT /api/stacks/${id}/redeploy: Redeploy gestartet`);

  try {
    await redeployStackById(id, REDEPLOY_TYPES.SINGLE);
    console.log(`✅ PUT /api/stacks/${id}/redeploy: Redeploy erfolgreich abgeschlossen`);
    res.json({ success: true, message: 'Stack redeployed' });
  } catch (err) {
    const errorMessage = err.message || 'Unbekannter Fehler beim Redeploy';
    console.error(`❌ Fehler beim Redeploy von Stack ${id}:`, errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

// Redeploy ALL
app.put(
  '/api/stacks/redeploy-all',
  maintenanceGuard,
  requirePermission('stacks-redeploy-all', 'full'),
  async (req, res) => {
  console.log(`🚀 PUT /api/stacks/redeploy-all: Redeploy ALL gestartet`);

  const serverContextId = getActiveServerUrl() || null;

  try {
    const stacksRes = await axiosInstance.get('/api/stacks');
    const filteredStacks = Array.isArray(stacksRes.data) ? stacksRes.data : [];

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
    logEvent({
      category: 'stack',
      eventType: REDEPLOY_TYPES.ALL,
      action: 'redeploy-alle',
      status: 'gestartet',
      entityType: 'bulk-operation',
      entityId: 'redeploy-alle',
      entityName: 'Redeploy ALLE',
      contextType: serverContextId ? 'server' : null,
      contextId: serverContextId,
      message: `Redeploy ALLE gestartet für: ${stackSummary}`,
      metadata: {
        stacks: stackSummaryList
      },
      source: 'system'
    });

    if (!eligibleStacks.length) {
      console.log('ℹ️ Keine veralteten Stacks für Redeploy ALL vorhanden');
      return res.json({ success: true, message: 'Keine veralteten Stacks gefunden' });
    }

    eligibleStacks.forEach((stack) => {
      broadcastRedeployStatus({
        stackId: stack.Id,
        stackName: stack.Name,
        phase: REDEPLOY_PHASES.QUEUED
      });
    });

    for (const stack of eligibleStacks) {
      try {
        await redeployStackById(stack.Id, REDEPLOY_TYPES.ALL);
        console.log(`✅ Redeploy ALL -> Stack ${stack.Name} (${stack.Id}) erfolgreich`);
      } catch (err) {
        console.error(`❌ Redeploy ALL -> Stack ${stack.Name} (${stack.Id}) fehlgeschlagen:`, err.message);
      }
    }

    logEvent({
      category: 'stack',
      eventType: REDEPLOY_TYPES.ALL,
      action: 'redeploy-alle',
      status: 'erfolgreich',
      entityType: 'bulk-operation',
      entityId: 'redeploy-alle',
      entityName: 'Redeploy ALLE',
      contextType: serverContextId ? 'server' : null,
      contextId: serverContextId,
      message: 'Redeploy ALLE abgeschlossen',
      metadata: {
        processedStacks: stackSummaryList
      },
      source: 'system'
    });

    res.json({ success: true, message: 'Redeploy ALL abgeschlossen' });
  } catch (err) {
    const message = err.response?.data?.message || err.message;
    logEvent({
      category: 'stack',
      eventType: REDEPLOY_TYPES.ALL,
      action: 'redeploy-alle',
      status: 'error',
      entityType: 'bulk-operation',
      entityId: 'redeploy-alle',
      entityName: 'Redeploy ALLE',
      contextType: serverContextId ? 'server' : null,
      contextId: serverContextId,
      message,
      source: 'system'
    });
    console.error('❌ Fehler bei Redeploy ALLE:', message);
    res.status(500).json({ error: message });
  }
});

// Redeploy selection
app.put(
  '/api/stacks/redeploy-selection',
  maintenanceGuard,
  requirePermission('stacks-redeploy-selection', 'full'),
  async (req, res) => {
  const { stackIds } = req.body || {};
  const totalCount = Array.isArray(stackIds) ? stackIds.length : 0;
  console.log(`🚀 PUT /api/stacks/redeploy-selection: Redeploy Auswahl gestartet (${totalCount} Stacks)`);

  if (!Array.isArray(stackIds) || stackIds.length === 0) {
    return res.status(400).json({ error: 'stackIds muss eine nicht leere Array sein' });
  }

  const serverContextId = getActiveServerUrl() || null;

  try {
    const normalizedIds = stackIds.map((id) => String(id));
    const { filteredStacks } = await loadStackCollections();
    const stacksById = new Map(filteredStacks.map((stack) => [String(stack.Id), stack]));

    const missingIds = normalizedIds.filter((id) => !stacksById.has(id));
    if (missingIds.length) {
      return res.status(400).json({ error: `Ungültige Stack-IDs: ${missingIds.join(', ')}` });
    }

    const selectedStacks = normalizedIds.map((id) => stacksById.get(id)).filter(Boolean);
    if (!selectedStacks.length) {
      return res.status(400).json({ error: 'Keine gültigen Stacks für Redeploy Auswahl gefunden' });
    }

    const { eligibleStacks, skippedStacks } = await filterOutdatedStacks(selectedStacks);

    if (skippedStacks.length) {
      skippedStacks.forEach((stack) => {
        console.log(`⏭️ Redeploy Auswahl übersprungen (aktuell): ${stack.Name} (${stack.Id})`);
      });
    }

    const summaryList = eligibleStacks.map((stack) => `${stack.Name} (${stack.Id})`);
    const summaryText = summaryList.length ? summaryList.join(', ') : 'keine Stacks';

    logEvent({
      category: 'stack',
      eventType: REDEPLOY_TYPES.SELECTION,
      action: 'redeploy-auswahl',
      status: 'gestartet',
      entityType: 'bulk-operation',
      entityId: 'redeploy-auswahl',
      entityName: `Redeploy Auswahl (${stackIds.length})`,
      contextType: serverContextId ? 'server' : null,
      contextId: serverContextId,
      message: `Redeploy Auswahl gestartet für: ${summaryText}`,
      metadata: {
        requestedStackIds: normalizedIds
      },
      source: 'system'
    });

    if (!eligibleStacks.length) {
      logEvent({
        category: 'stack',
        eventType: REDEPLOY_TYPES.SELECTION,
        action: 'redeploy-auswahl',
        status: 'erfolgreich',
        entityType: 'bulk-operation',
        entityId: 'redeploy-auswahl',
        entityName: `Redeploy Auswahl (${stackIds.length})`,
        contextType: serverContextId ? 'server' : null,
        contextId: serverContextId,
        message: 'Redeploy Auswahl übersprungen: keine veralteten Stacks',
        metadata: {
          requestedStackIds: normalizedIds,
          skipped: true
        },
        source: 'system'
      });
      return res.json({ success: true, message: 'Keine veralteten Stacks in der Auswahl' });
    }

    eligibleStacks.forEach((stack) => {
      broadcastRedeployStatus({
        stackId: stack.Id,
        stackName: stack.Name,
        phase: REDEPLOY_PHASES.QUEUED
      });
    });

    for (const stack of eligibleStacks) {
      try {
        await redeployStackById(stack.Id, REDEPLOY_TYPES.SELECTION);
        console.log(`✅ Redeploy Auswahl -> Stack ${stack.Name} (${stack.Id}) erfolgreich`);
      } catch (err) {
        console.error(`❌ Redeploy Auswahl -> Stack ${stack.Name} (${stack.Id}) fehlgeschlagen:`, err.message);
      }
    }

    logEvent({
      category: 'stack',
      eventType: REDEPLOY_TYPES.SELECTION,
      action: 'redeploy-auswahl',
      status: 'erfolgreich',
      entityType: 'bulk-operation',
      entityId: 'redeploy-auswahl',
      entityName: `Redeploy Auswahl (${stackIds.length})`,
      contextType: serverContextId ? 'server' : null,
      contextId: serverContextId,
      message: 'Redeploy Auswahl abgeschlossen',
      metadata: {
        processedStackIds: eligibleStacks.map((stack) => String(stack.Id))
      },
      source: 'system'
    });

    res.json({ success: true, message: 'Redeploy Auswahl abgeschlossen' });
  } catch (err) {
    const message = err.response?.data?.message || err.message;
    const normalized = Array.isArray(stackIds) ? stackIds.map((id) => String(id)) : [];
    logEvent({
      category: 'stack',
      eventType: REDEPLOY_TYPES.SELECTION,
      action: 'redeploy-auswahl',
      status: 'fehler',
      entityType: 'bulk-operation',
      entityId: 'redeploy-auswahl',
      entityName: `Redeploy Auswahl (${Array.isArray(stackIds) ? stackIds.length : 0})`,
      contextType: serverContextId ? 'server' : null,
      contextId: serverContextId,
      message,
      metadata: {
        requestedStackIds: normalized
      },
      source: 'system'
    });
    console.error('❌ Fehler bei Redeploy Auswahl:', message);
    res.status(500).json({ error: message });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
});
