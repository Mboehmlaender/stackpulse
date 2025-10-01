import { db } from './index.js';

const valueToArray = (value) => {
  if (!value && value !== 0) return [];
  const base = Array.isArray(value) ? value : [value];
  return base
    .flatMap((entry) => String(entry).split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const singleValue = (value) => {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

export function buildLogFilter(queryParams = {}) {
  const filters = [];
  const params = {};

  const ids = valueToArray(queryParams.ids ?? queryParams.id)
    .map((entry) => Number(entry))
    .filter((value) => !Number.isNaN(value));
  if (ids.length) {
    const placeholders = ids.map((_, idx) => `@id${idx}`);
    filters.push(`id IN (${placeholders.join(', ')})`);
    ids.forEach((value, idx) => {
      params[`id${idx}`] = value;
    });
  }

  const stackIds = valueToArray(queryParams.stackIds ?? queryParams.stackId);
  if (stackIds.length) {
    const placeholders = stackIds.map((_, idx) => `@stackId${idx}`);
    filters.push(`stack_id IN (${placeholders.join(', ')})`);
    stackIds.forEach((stack, idx) => {
      params[`stackId${idx}`] = stack;
    });
  }

  const statuses = valueToArray(queryParams.statuses ?? queryParams.status);
  if (statuses.length) {
    const placeholders = statuses.map((_, idx) => `@status${idx}`);
    filters.push(`status IN (${placeholders.join(', ')})`);
    statuses.forEach((entry, idx) => {
      params[`status${idx}`] = entry;
    });
  }

  const endpoints = valueToArray(queryParams.endpoints ?? queryParams.endpoint);
  if (endpoints.length) {
    const placeholders = endpoints.map((_, idx) => `@endpoint${idx}`);
    filters.push(`endpoint IN (${placeholders.join(', ')})`);
    endpoints.forEach((entry, idx) => {
      const numeric = Number(entry);
      params[`endpoint${idx}`] = Number.isNaN(numeric) ? entry : numeric;
    });
  }

  const redeployTypes = valueToArray(queryParams.redeployTypes ?? queryParams.redeployType);
  if (redeployTypes.length) {
    const placeholders = redeployTypes.map((_, idx) => `@redeployType${idx}`);
    filters.push(`redeploy_type IN (${placeholders.join(', ')})`);
    redeployTypes.forEach((entry, idx) => {
      params[`redeployType${idx}`] = entry;
    });
  }

  const messageQuery = singleValue(queryParams.message);
  if (messageQuery && String(messageQuery).trim()) {
    filters.push('message LIKE @message');
    params.message = `%${String(messageQuery).trim()}%`;
  }

  const from = singleValue(queryParams.from);
  if (from) {
    filters.push('timestamp >= @from');
    params.from = from;
  }

  const to = singleValue(queryParams.to);
  if (to) {
    filters.push('timestamp <= @to');
    params.to = to;
  }

  return {
    whereClause: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
    params,
  };
}

const insertRedeployLogStmt = db.prepare(`
  INSERT INTO redeploy_logs (stack_id, stack_name, status, message, endpoint, redeploy_type)
  VALUES (@stackId, @stackName, @status, @message, @endpoint, @redeployType)
`);

export function logRedeployEvent({ stackId, stackName, status, message = null, endpoint = null, redeployType = null }) {
  try {
    insertRedeployLogStmt.run({
      stackId: String(stackId),
      stackName: stackName ?? 'Unknown',
      status,
      message,
      endpoint,
      redeployType: redeployType ?? null
    });
  } catch (err) {
    console.error('❌ Fehler beim Speichern des Redeploy-Logs:', err.message);
  }
}

export function deleteLogById(id) {
  const stmt = db.prepare('DELETE FROM redeploy_logs WHERE id = ?');
  const info = stmt.run(id);
  return info.changes || 0;
}

export function deleteLogsByFilters(queryParams = {}) {
  const { whereClause, params } = buildLogFilter(queryParams);
  const stmt = db.prepare(`DELETE FROM redeploy_logs ${whereClause}`);
  const info = stmt.run(params);
  return info.changes || 0;
}

export function exportLogsByFilters(queryParams = {}, format = 'txt') {
  const { whereClause, params } = buildLogFilter(queryParams);
  const rows = db.prepare(`
    SELECT id, timestamp, stack_id AS stackId, stack_name AS stackName, status, message, endpoint, redeploy_type AS redeployType
    FROM redeploy_logs
    ${whereClause}
    ORDER BY datetime(timestamp) DESC
  `).all(params);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (format === 'sql') {
    const statements = rows.map((row) => {
      const columns = ['id', 'timestamp', 'stack_id', 'stack_name', 'status', 'message', 'endpoint', 'redeploy_type'];
      const values = [
        row.id,
        row.timestamp,
        row.stackId,
        row.stackName,
        row.status,
        row.message,
        row.endpoint,
        row.redeployType
      ].map((value) => {
        if (value === null || value === undefined) return 'NULL';
        return `'${String(value).replace(/'/g, "''")}'`;
      });
      return `INSERT INTO redeploy_logs (${columns.join(', ')}) VALUES (${values.join(', ')});`;
    });

    return {
      filename: `redeploy-logs-${timestamp}.sql`,
      contentType: 'application/sql; charset=utf-8',
      content: statements.join('\n')
    };
  }

  const lines = rows.map((row) => {
    const parts = [
      `[${row.id}]`,
      row.timestamp,
      `Stack: ${row.stackName ?? 'Unbekannt'} (ID: ${row.stackId})`,
      `Status: ${row.status}`,
      `Endpoint: ${row.endpoint ?? '-'}`,
      `Nachricht: ${row.message ?? '-'}`,
      `Redeploy: ${row.redeployType ?? '-'}`
    ];
    return parts.join(' | ');
  });

  return {
    filename: `redeploy-logs-${timestamp}.txt`,
    contentType: 'text/plain; charset=utf-8',
    content: lines.join('\n')
  };
}
