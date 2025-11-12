import crypto from 'crypto';
import { db } from '../db/index.js';
import { hasSuperuser } from '../auth/superuser.js';

const selectAllServers = db.prepare('SELECT * FROM servers ORDER BY id ASC');
const selectServerById = db.prepare('SELECT * FROM servers WHERE id = ?');
const selectServerByUrl = db.prepare('SELECT * FROM servers WHERE url = ?');
const insertServer = db.prepare(`
  INSERT INTO servers (name, url)
  VALUES (?, ?)
`);
const updateServer = db.prepare(`
  UPDATE servers
  SET name = ?, url = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const deleteServerStmt = db.prepare('DELETE FROM servers WHERE id = ?');

const selectApiKeyByServerId = db.prepare('SELECT * FROM server_api_keys WHERE server_id = ?');
const countApiKeysStmt = db.prepare('SELECT COUNT(*) as count FROM server_api_keys');
const selectAllApiKeys = db.prepare('SELECT server_id, created_at, updated_at FROM server_api_keys');
const upsertApiKey = db.prepare(`
  INSERT INTO server_api_keys (server_id, key_cipher, key_iv, key_tag, created_at, updated_at)
  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT(server_id) DO UPDATE SET
    key_cipher = excluded.key_cipher,
    key_iv = excluded.key_iv,
    key_tag = excluded.key_tag,
    updated_at = CURRENT_TIMESTAMP
`);
const deleteApiKeyByServerId = db.prepare('DELETE FROM server_api_keys WHERE server_id = ?');

const countServersStmt = db.prepare('SELECT COUNT(*) as count FROM servers');
const selectFirstServerStmt = db.prepare('SELECT * FROM servers ORDER BY id ASC LIMIT 1');

const API_KEY_SECRET = crypto.createHash('sha256')
  .update(process.env.PORTAINER_API_SECRET || process.env.PORTAINER_API_KEY || 'stackpulse-portainer-api-key')
  .digest();

function encryptApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return null;
  const trimmed = apiKey.trim();
  if (!trimmed) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', API_KEY_SECRET, iv);
  const encrypted = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    content: encrypted.toString('base64'),
    tag: tag.toString('base64')
  };
}

function decryptApiKey(row) {
  if (!row) return '';
  try {
    const iv = Buffer.from(row.key_iv, 'base64');
    const content = Buffer.from(row.key_cipher, 'base64');
    const tag = Buffer.from(row.key_tag, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', API_KEY_SECRET, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.warn('⚠️ [Setup] API-Key konnte nicht entschlüsselt werden:', error.message);
    return '';
  }
}

function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
    const candidate = hasProtocol ? trimmed : `https://${trimmed}`;
    const normalized = new URL(candidate);
    const pathname = normalized.pathname.replace(/\/+$/, '');
    normalized.pathname = pathname || '/';
    normalized.hash = '';
    return normalized.toString().replace(/\/$/, '');
  } catch (err) {
    return '';
  }
}

function deriveServerName(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch (err) {
    return url;
  }
}

function ensureServer({ name, url }) {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    const error = new Error('SERVER_URL_REQUIRED');
    error.code = 'SERVER_URL_REQUIRED';
    throw error;
  }
  const normalizedName = (name || deriveServerName(normalizedUrl)).trim();
  if (!normalizedName) {
    const error = new Error('SERVER_NAME_REQUIRED');
    error.code = 'SERVER_NAME_REQUIRED';
    throw error;
  }

  const existing = selectServerByUrl.get(normalizedUrl);
  if (existing) {
    if (existing.name !== normalizedName) {
      updateServer.run(normalizedName, normalizedUrl, existing.id);
      const updated = selectServerById.get(existing.id);
      console.log(`ℹ️ [Setup] Server aktualisiert: ${updated.name} (${updated.id})`);
      return updated;
    }
    return existing;
  }

  const result = insertServer.run(normalizedName, normalizedUrl);
  const created = selectServerById.get(result.lastInsertRowid);
  console.log(`✅ [Setup] Server angelegt: ${created.name} (${created.id})`);
  return created;
}

function setServerApiKey({ serverId, apiKey }) {
  const id = Number(serverId);
  if (!Number.isFinite(id)) {
    const error = new Error('SERVER_ID_INVALID');
    error.code = 'SERVER_ID_INVALID';
    throw error;
  }

  const server = selectServerById.get(id);
  if (!server) {
    const error = new Error('SERVER_NOT_FOUND');
    error.code = 'SERVER_NOT_FOUND';
    throw error;
  }

  const normalizedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!normalizedKey) {
    const error = new Error('API_KEY_REQUIRED');
    error.code = 'API_KEY_REQUIRED';
    throw error;
  }

  const encrypted = encryptApiKey(normalizedKey);
  if (!encrypted) {
    const error = new Error('API_KEY_ENCRYPT_FAILED');
    error.code = 'API_KEY_ENCRYPT_FAILED';
    throw error;
  }

  const existing = selectApiKeyByServerId.get(id);
  upsertApiKey.run(id, encrypted.content, encrypted.iv, encrypted.tag);
  console.log(`${existing ? 'ℹ️' : '🔐'} [Setup] API-Key ${existing ? 'aktualisiert' : 'angelegt'}: Server ${server.name} (${server.id})`);

  return {
    serverId: server.id,
    updatedAt: new Date().toISOString()
  };
}

function getActiveApiKey() {
  const firstServer = selectFirstServerStmt.get();
  if (firstServer) {
    const row = selectApiKeyByServerId.get(firstServer.id);
    const key = decryptApiKey(row);
    if (key) return key;
  }

  const envKey = process.env.PORTAINER_API_KEY ? process.env.PORTAINER_API_KEY.trim() : '';
  return envKey || '';
}

function getActiveServerUrl() {
  const firstServer = selectFirstServerStmt.get();
  if (firstServer?.url) {
    const normalizedUrl = normalizeUrl(firstServer.url);
    if (normalizedUrl) {
      return normalizedUrl;
    }
  }

  const envUrl = process.env.PORTAINER_URL ? process.env.PORTAINER_URL.trim() : '';
  const normalizedEnvUrl = envUrl ? normalizeUrl(envUrl) : '';
  return normalizedEnvUrl || '';
}

function hasServer() {
  const { count } = countServersStmt.get();
  return count > 0;
}

function removeServer(serverId) {
  const id = Number(serverId);
  if (!Number.isFinite(id)) {
    const error = new Error('SERVER_ID_INVALID');
    error.code = 'SERVER_ID_INVALID';
    throw error;
  }

  const server = selectServerById.get(id);
  if (!server) {
    const error = new Error('SERVER_NOT_FOUND');
    error.code = 'SERVER_NOT_FOUND';
    throw error;
  }

  const existingApiKey = selectApiKeyByServerId.get(id);

  deleteServerStmt.run(id);

  if (existingApiKey) {
    console.log(`🗑️ [Setup] API-Key entfernt: Server ${server.name} (${server.id})`);
  }

  console.log(`🗑️ [Setup] Server entfernt: ${server.name} (${server.id})`);

  return {
    server,
    removed: true
  };
}

function hasApiKey() {
  const { count } = countApiKeysStmt.get();
  return count > 0;
}

function hasCompleteSetup() {
  return hasSuperuser() && hasServer() && hasApiKey();
}

function ensureDefaultsFromEnv() {
  const envServerUrlRaw = process.env.PORTAINER_URL;
  const envServerName = process.env.PORTAINER_SERVER_NAME;
  let server = null;
  if (envServerUrlRaw) {
    try {
      server = ensureServer({ name: envServerName, url: envServerUrlRaw });
    } catch (error) {
      console.error('⚠️ [Setup] Konnte Server aus Umgebungsvariablen nicht anlegen:', error.message);
    }
  }

  const envApiKeyRaw = typeof process.env.PORTAINER_API_KEY === 'string' ? process.env.PORTAINER_API_KEY : '';
  if (envApiKeyRaw.trim()) {
    const targetServer = server || selectFirstServerStmt.get();
    if (targetServer) {
      try {
        setServerApiKey({ serverId: targetServer.id, apiKey: envApiKeyRaw.trim() });
      } catch (error) {
        console.error('⚠️ [Setup] Konnte API-Key aus Umgebungsvariablen nicht speichern:', error.message);
      }
    }
  }
}

function getSetupStatus() {
  const servers = selectAllServers.all();
  const apiKeyRecords = selectAllApiKeys.all();
  const apiKeyMap = new Map(apiKeyRecords.map((entry) => [entry.server_id, entry]));

  const rawEnvServerName = typeof process.env.PORTAINER_SERVER_NAME === 'string' ? process.env.PORTAINER_SERVER_NAME : '';
  const envServerName = rawEnvServerName.trim();
  const rawEnvServerUrl = typeof process.env.PORTAINER_URL === 'string' ? process.env.PORTAINER_URL : '';
  const envServerUrl = rawEnvServerUrl.trim();
  const rawEnvApiKey = typeof process.env.PORTAINER_API_KEY === 'string' ? process.env.PORTAINER_API_KEY : '';
  const envApiKeyTrimmed = rawEnvApiKey.trim();
  const envApiKeyProvided = Boolean(envApiKeyTrimmed);
  const envSuperuserUsernameRaw = typeof process.env.SUPERUSER_USERNAME === 'string' ? process.env.SUPERUSER_USERNAME : '';
  const envSuperuserEmailRaw = typeof process.env.SUPERUSER_EMAIL === 'string' ? process.env.SUPERUSER_EMAIL : '';
  const envSuperuserPasswordRaw = typeof process.env.SUPERUSER_PASSWORD === 'string' ? process.env.SUPERUSER_PASSWORD : '';
  const envSuperuserUsername = envSuperuserUsernameRaw.trim();
  const envSuperuserEmail = envSuperuserEmailRaw.trim();

  const serverRequired = servers.length === 0;

  const apiKeyItems = servers.map((server) => {
    const keyMeta = apiKeyMap.get(server.id) || null;
    return {
      serverId: server.id,
      serverName: server.name,
      hasKey: Boolean(keyMeta),
      updatedAt: keyMeta?.updated_at ?? null
    };
  });
  const apiKeyCount = apiKeyItems.filter((item) => item.hasKey).length;
  const apiKeyRequired = servers.length > 0 && apiKeyCount === 0;

  const superuserExists = hasSuperuser();
  const setupComplete = superuserExists && !serverRequired && !apiKeyRequired;

  return {
    superuser: {
      exists: superuserExists,
      envProvided: Boolean(envSuperuserUsername || envSuperuserEmail || envSuperuserPasswordRaw),
      env: {
        username: envSuperuserUsernameRaw,
        email: envSuperuserEmailRaw,
        password: envSuperuserPasswordRaw
      }
    },
    servers: {
      count: servers.length,
      items: servers,
      requireInput: serverRequired,
      envProvided: Boolean(envServerUrl)
    },
    apiKeys: {
      count: apiKeyCount,
      items: apiKeyItems,
      requireInput: apiKeyRequired,
      envProvided: envApiKeyProvided,
      envValue: rawEnvApiKey
    },
    requirements: {
      superuser: !superuserExists,
      server: serverRequired,
      apiKey: apiKeyRequired
    },
    setupComplete,
    envDefaults: {
      serverName: envServerName || (envServerUrl ? deriveServerName(envServerUrl) : ''),
      serverNameFromEnv: rawEnvServerName,
      serverUrl: envServerUrl,
      apiKeyProvided: envApiKeyProvided,
      apiKeyValue: rawEnvApiKey,
      superuserUsername: envSuperuserUsernameRaw,
      superuserEmail: envSuperuserEmailRaw,
      superuserPassword: envSuperuserPasswordRaw
    }
  };
}

function completeSetup({ server: serverInput }) {
  let serverRecord = null;

  if (serverInput && typeof serverInput.url === 'string' && serverInput.url.trim()) {
    serverRecord = ensureServer(serverInput);
  } else {
    serverRecord = selectFirstServerStmt.get();
  }

  if (!serverRecord) {
    const error = new Error('SERVER_DETAILS_REQUIRED');
    error.code = 'SERVER_DETAILS_REQUIRED';
    throw error;
  }

  return {
    server: serverRecord
  };
}

export {
  ensureDefaultsFromEnv,
  ensureServer,
  setServerApiKey,
  getActiveApiKey,
  getActiveServerUrl,
  hasServer,
  hasApiKey,
  hasCompleteSetup,
  getSetupStatus,
  completeSetup,
  removeServer
};
