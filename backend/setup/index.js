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

const selectAllEndpoints = db.prepare(`
  SELECT e.*, s.name as server_name, s.url as server_url
  FROM endpoints e
  INNER JOIN servers s ON s.id = e.server_id
  ORDER BY e.id ASC
`);
const selectEndpointById = db.prepare('SELECT * FROM endpoints WHERE id = ?');
const selectEndpointByExternalId = db.prepare('SELECT * FROM endpoints WHERE external_id = ?');
const selectEndpointByServerAndExternal = db.prepare('SELECT * FROM endpoints WHERE server_id = ? AND external_id = ?');
const selectEndpointsByServerId = db.prepare('SELECT * FROM endpoints WHERE server_id = ?');
const insertEndpoint = db.prepare(`
  INSERT INTO endpoints (server_id, name, external_id, is_default)
  VALUES (?, ?, ?, ?)
`);
const updateEndpoint = db.prepare(`
  UPDATE endpoints
  SET name = ?, external_id = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);
const deleteEndpointStmt = db.prepare('DELETE FROM endpoints WHERE id = ?');
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

const clearDefaultEndpointStmt = db.prepare('UPDATE endpoints SET is_default = 0 WHERE is_default != 0');
const setDefaultEndpointStmt = db.prepare('UPDATE endpoints SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
const selectDefaultEndpointStmt = db.prepare(`
  SELECT e.*, s.name as server_name, s.url as server_url
  FROM endpoints e
  INNER JOIN servers s ON s.id = e.server_id
  WHERE e.is_default = 1
  LIMIT 1
`);
const countServersStmt = db.prepare('SELECT COUNT(*) as count FROM servers');
const countEndpointsStmt = db.prepare('SELECT COUNT(*) as count FROM endpoints');
const selectFirstServerStmt = db.prepare('SELECT * FROM servers ORDER BY id ASC LIMIT 1');
const selectFirstEndpointStmt = db.prepare(`
  SELECT e.*, s.name as server_name, s.url as server_url
  FROM endpoints e
  INNER JOIN servers s ON s.id = e.server_id
  ORDER BY e.id ASC
  LIMIT 1
`);
const transactionalSetDefaultEndpoint = db.transaction((endpointId) => {
  clearDefaultEndpointStmt.run();
  setDefaultEndpointStmt.run(endpointId);
});

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

function ensureEndpoint({ serverId, name, externalId, makeDefault = false }) {
  if (!serverId) {
    const error = new Error('SERVER_REQUIRED');
    error.code = 'SERVER_REQUIRED';
    throw error;
  }
  const server = selectServerById.get(serverId);
  if (!server) {
    const error = new Error('SERVER_NOT_FOUND');
    error.code = 'SERVER_NOT_FOUND';
    throw error;
  }

  const trimmedExternal = String(externalId ?? '').trim();
  if (!trimmedExternal) {
    const error = new Error('ENDPOINT_EXTERNAL_ID_REQUIRED');
    error.code = 'ENDPOINT_EXTERNAL_ID_REQUIRED';
    throw error;
  }

  const normalizedName = String(name || `Endpoint ${trimmedExternal}`).trim();
  if (!normalizedName) {
    const error = new Error('ENDPOINT_NAME_REQUIRED');
    error.code = 'ENDPOINT_NAME_REQUIRED';
    throw error;
  }

  let existing = selectEndpointByServerAndExternal.get(serverId, trimmedExternal);
  if (existing) {
    if (existing.name !== normalizedName || existing.external_id !== trimmedExternal) {
      updateEndpoint.run(normalizedName, trimmedExternal, existing.id);
      existing = selectEndpointById.get(existing.id);
      console.log(`ℹ️ [Setup] Endpoint aktualisiert: ${existing.name} (${existing.id}) für Server ${server.name} (${server.id})`);
    }
  } else {
    const isDefault = makeDefault || countEndpointsStmt.get().count === 0 ? 1 : 0;
    const result = insertEndpoint.run(serverId, normalizedName, trimmedExternal, isDefault);
    existing = selectEndpointById.get(result.lastInsertRowid);
    console.log(`✅ [Setup] Endpoint angelegt: ${existing.name} (${existing.id}) für Server ${server.name} (${server.id})`);
  }

  if (makeDefault && existing && !existing.is_default) {
    transactionalSetDefaultEndpoint(existing.id);
    existing = selectEndpointById.get(existing.id);
  }

  return existing;
}

function removeEndpoint(endpointId) {
  const id = Number(endpointId);
  if (!Number.isFinite(id)) {
    const error = new Error('ENDPOINT_ID_INVALID');
    error.code = 'ENDPOINT_ID_INVALID';
    throw error;
  }

  const endpoint = selectEndpointById.get(id);
  if (!endpoint) {
    const error = new Error('ENDPOINT_NOT_FOUND');
    error.code = 'ENDPOINT_NOT_FOUND';
    throw error;
  }

  const wasDefault = Boolean(endpoint.is_default);
  deleteEndpointStmt.run(id);

  if (wasDefault) {
    const fallback = selectFirstEndpointStmt.get();
    if (fallback) {
      transactionalSetDefaultEndpoint(fallback.id);
      console.log(`ℹ️ [Setup] Neuer Standard-Endpoint gesetzt: ${fallback.name} (${fallback.id})`);
    }
  }

  console.log(`🗑️ [Setup] Endpoint entfernt: ${endpoint.name} (${endpoint.id}) für Server ${endpoint.server_id}`);

  return {
    endpoint,
    removed: true
  };
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

function setDefaultEndpoint(endpointId) {
  if (!endpointId) return null;
  const endpoint = selectEndpointById.get(endpointId);
  if (!endpoint) {
    const error = new Error('ENDPOINT_NOT_FOUND');
    error.code = 'ENDPOINT_NOT_FOUND';
    throw error;
  }
  transactionalSetDefaultEndpoint(endpointId);
  return selectEndpointById.get(endpointId);
}

function getDefaultEndpoint() {
  let endpoint = selectDefaultEndpointStmt.get();
  if (!endpoint) {
    endpoint = selectFirstEndpointStmt.get();
    if (endpoint) {
      transactionalSetDefaultEndpoint(endpoint.id);
      endpoint = selectDefaultEndpointStmt.get();
    }
  }
  return endpoint || null;
}

function getActiveEndpointExternalId() {
  const endpoint = getDefaultEndpoint();
  return endpoint ? endpoint.external_id : null;
}

function getActiveApiKey() {
  const defaultEndpoint = getDefaultEndpoint();
  if (defaultEndpoint) {
    const row = selectApiKeyByServerId.get(defaultEndpoint.server_id);
    const key = decryptApiKey(row);
    if (key) return key;
  }

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
  const endpoint = getDefaultEndpoint();
  if (endpoint) {
    const normalizedEndpointUrl = endpoint.server_url ? normalizeUrl(endpoint.server_url) : '';
    if (normalizedEndpointUrl) {
      return normalizedEndpointUrl;
    }
    const server = selectServerById.get(endpoint.server_id);
    if (server?.url) {
      const normalizedServerUrl = normalizeUrl(server.url);
      if (normalizedServerUrl) {
        return normalizedServerUrl;
      }
    }
  }

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

  const relatedEndpoints = selectEndpointsByServerId.all(id);
  const hadDefaultEndpoint = relatedEndpoints.some((endpoint) => endpoint.is_default);
  const existingApiKey = selectApiKeyByServerId.get(id);

  deleteServerStmt.run(id);

  if (existingApiKey) {
    console.log(`🗑️ [Setup] API-Key entfernt: Server ${server.name} (${server.id})`);
  }

  if (hadDefaultEndpoint) {
    const fallback = getDefaultEndpoint();
    if (fallback) {
      console.log(`ℹ️ [Setup] Neuer Standard-Endpoint gesetzt: ${fallback.name} (${fallback.id})`);
    }
  }

  console.log(`🗑️ [Setup] Server entfernt: ${server.name} (${server.id}) – entfernte Endpoints: ${relatedEndpoints.length}`);

  return {
    server,
    removed: true,
    endpointsRemoved: relatedEndpoints.length
  };
}

function hasEndpoint() {
  const { count } = countEndpointsStmt.get();
  return count > 0;
}

function hasApiKey() {
  const { count } = countApiKeysStmt.get();
  return count > 0;
}

function hasCompleteSetup() {
  return hasSuperuser() && hasServer() && hasEndpoint() && hasApiKey();
}

function ensureDefaultsFromEnv() {
  const envServerUrlRaw = process.env.PORTAINER_URL;
  const envServerName = process.env.PORTAINER_SERVER_NAME;
  const envEndpointIdRaw = process.env.PORTAINER_ENDPOINT_ID;
  const envEndpointName = process.env.PORTAINER_ENDPOINT_NAME;
  let server = null;
  if (envServerUrlRaw) {
    try {
      server = ensureServer({ name: envServerName, url: envServerUrlRaw });
    } catch (error) {
      console.error('⚠️ [Setup] Konnte Server aus Umgebungsvariablen nicht anlegen:', error.message);
    }
  }

  const trimmedEndpointId = typeof envEndpointIdRaw === 'string' ? envEndpointIdRaw.trim() : '';
  if (trimmedEndpointId) {
    const existingEndpoint = selectEndpointByExternalId.get(trimmedEndpointId);
    if (!existingEndpoint) {
      const targetServer = server || selectFirstServerStmt.get();
      if (targetServer) {
        try {
          const endpointName = envEndpointName || `Endpoint ${trimmedEndpointId}`;
          ensureEndpoint({
            serverId: targetServer.id,
            name: endpointName,
            externalId: trimmedEndpointId,
            makeDefault: true
          });
        } catch (error) {
          console.error('⚠️ [Setup] Konnte Endpoint aus Umgebungsvariablen nicht anlegen:', error.message);
        }
      } else {
        console.warn('⚠️ [Setup] Endpoint aus Umgebungsvariablen benötigt einen vorhandenen Server.');
      }
    } else if (!existingEndpoint.is_default) {
      transactionalSetDefaultEndpoint(existingEndpoint.id);
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
  const endpoints = selectAllEndpoints.all();
  const defaultEndpoint = getDefaultEndpoint();
  const apiKeyRecords = selectAllApiKeys.all();
  const apiKeyMap = new Map(apiKeyRecords.map((entry) => [entry.server_id, entry]));

  const rawEnvServerName = typeof process.env.PORTAINER_SERVER_NAME === 'string' ? process.env.PORTAINER_SERVER_NAME : '';
  const envServerName = rawEnvServerName.trim();
  const rawEnvServerUrl = typeof process.env.PORTAINER_URL === 'string' ? process.env.PORTAINER_URL : '';
  const envServerUrl = rawEnvServerUrl.trim();
  const rawEnvEndpointName = typeof process.env.PORTAINER_ENDPOINT_NAME === 'string' ? process.env.PORTAINER_ENDPOINT_NAME : '';
  const envEndpointName = rawEnvEndpointName.trim();
  const rawEnvEndpointId = typeof process.env.PORTAINER_ENDPOINT_ID === 'string' ? process.env.PORTAINER_ENDPOINT_ID : '';
  const envEndpointId = rawEnvEndpointId.trim();
  const rawEnvApiKey = typeof process.env.PORTAINER_API_KEY === 'string' ? process.env.PORTAINER_API_KEY : '';
  const envApiKeyTrimmed = rawEnvApiKey.trim();
  const envApiKeyProvided = Boolean(envApiKeyTrimmed);
  const envSuperuserUsernameRaw = typeof process.env.SUPERUSER_USERNAME === 'string' ? process.env.SUPERUSER_USERNAME : '';
  const envSuperuserEmailRaw = typeof process.env.SUPERUSER_EMAIL === 'string' ? process.env.SUPERUSER_EMAIL : '';
  const envSuperuserPasswordRaw = typeof process.env.SUPERUSER_PASSWORD === 'string' ? process.env.SUPERUSER_PASSWORD : '';
  const envSuperuserUsername = envSuperuserUsernameRaw.trim();
  const envSuperuserEmail = envSuperuserEmailRaw.trim();

  const serverRequired = servers.length === 0;
  const endpointRequired = endpoints.length === 0;

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
  const setupComplete = superuserExists && !serverRequired && !endpointRequired && !apiKeyRequired;

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
    endpoints: {
      count: endpoints.length,
      items: endpoints,
      requireInput: endpointRequired,
      envProvided: Boolean(envEndpointId),
      default: defaultEndpoint
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
      endpoint: endpointRequired,
      apiKey: apiKeyRequired
    },
    setupComplete,
    envDefaults: {
      serverName: envServerName || (envServerUrl ? deriveServerName(envServerUrl) : ''),
      serverNameFromEnv: rawEnvServerName,
      serverUrl: envServerUrl,
      endpointName: envEndpointName || (envEndpointId ? `Endpoint ${envEndpointId}` : ''),
      endpointNameFromEnv: rawEnvEndpointName,
      endpointExternalId: envEndpointId,
      apiKeyProvided: envApiKeyProvided,
      apiKeyValue: rawEnvApiKey,
      superuserUsername: envSuperuserUsernameRaw,
      superuserEmail: envSuperuserEmailRaw,
      superuserPassword: envSuperuserPasswordRaw
    }
  };
}

const createEndpointWithDefaultTransaction = db.transaction(({ serverInput, endpointInput }) => {
  let server = null;

  if (endpointInput?.serverId) {
    const byId = selectServerById.get(endpointInput.serverId);
    if (!byId) {
      const error = new Error('SERVER_NOT_FOUND');
      error.code = 'SERVER_NOT_FOUND';
      throw error;
    }
    server = byId;
  }

  if (serverInput) {
    server = ensureServer(serverInput);
  }

  if (!server) {
    server = selectFirstServerStmt.get();
  }

  if (!server) {
    const error = new Error('SERVER_DETAILS_REQUIRED');
    error.code = 'SERVER_DETAILS_REQUIRED';
    throw error;
  }

  if (!endpointInput) {
    const error = new Error('ENDPOINT_DETAILS_REQUIRED');
    error.code = 'ENDPOINT_DETAILS_REQUIRED';
    throw error;
  }

  const endpoint = ensureEndpoint({
    serverId: server.id,
    name: endpointInput.name,
    externalId: endpointInput.externalId,
    makeDefault: true
  });

  return {
    server,
    endpoint
  };
});

function completeSetup({ server: serverInput, endpoint: endpointInput }) {
  const result = createEndpointWithDefaultTransaction({ serverInput, endpointInput });
  return {
    server: result.server,
    endpoint: result.endpoint,
    defaultEndpoint: getDefaultEndpoint()
  };
}

export {
  ensureDefaultsFromEnv,
  ensureServer,
  ensureEndpoint,
  setServerApiKey,
  setDefaultEndpoint,
  getDefaultEndpoint,
  getActiveEndpointExternalId,
  getActiveApiKey,
  getActiveServerUrl,
  hasServer,
  hasEndpoint,
  hasApiKey,
  hasCompleteSetup,
  getSetupStatus,
  completeSetup,
  removeEndpoint,
  removeServer
};
