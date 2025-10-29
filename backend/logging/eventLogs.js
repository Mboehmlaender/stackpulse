import { db } from '../db/index.js';

const valueToArray = (value) => {
  if (value === undefined || value === null) return [];
  const base = Array.isArray(value) ? value : [value];
  return base
    .flatMap((entry) => String(entry).split(','))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const singleValue = (value) => {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

const serializeJson = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (err) {
    console.error('⚠️ Konnte JSON nicht serialisieren:', err.message);
    return JSON.stringify({ serializationError: true });
  }
};

const appendInFilter = (filters, params, values, column, prefix) => {
  if (!values.length) return;
  const placeholders = values.map((_, idx) => {
    const key = `${prefix}${idx}`;
    params[key] = values[idx];
    return `@${key}`;
  });
  filters.push(`${column} IN (${placeholders.join(', ')})`);
};

export function buildEventLogFilter(queryParams = {}) {
  const filters = [];
  const params = {};

  const ids = valueToArray(queryParams.ids ?? queryParams.id)
    .map((entry) => Number(entry))
    .filter((value) => Number.isFinite(value));
  if (ids.length) {
    appendInFilter(filters, params, ids, 'id', 'id');
  }

  const categories = valueToArray(queryParams.categories ?? queryParams.category);
  appendInFilter(filters, params, categories, 'category', 'category');

  const statuses = valueToArray(queryParams.statuses ?? queryParams.status);
  appendInFilter(filters, params, statuses, 'status', 'status');

  const actions = valueToArray(queryParams.actions ?? queryParams.action);
  appendInFilter(filters, params, actions, 'action', 'action');

  const eventTypes = [
    ...valueToArray(queryParams.eventTypes ?? queryParams.eventType),
    ...valueToArray(queryParams.redeployTypes ?? queryParams.redeployType)
  ];
  if (eventTypes.length) {
    const unique = Array.from(new Set(eventTypes));
    appendInFilter(filters, params, unique, 'event_type', 'eventType');
  }

  const severities = valueToArray(queryParams.severities ?? queryParams.severity);
  appendInFilter(filters, params, severities, 'severity', 'severity');

  const entityTypes = valueToArray(queryParams.entityTypes ?? queryParams.entityType);
  appendInFilter(filters, params, entityTypes, 'entity_type', 'entityType');

  const entityIds = valueToArray(queryParams.entityIds ?? queryParams.entityId);
  appendInFilter(filters, params, entityIds, 'entity_id', 'entityId');

  const actorTypes = valueToArray(queryParams.actorTypes ?? queryParams.actorType);
  appendInFilter(filters, params, actorTypes, 'actor_type', 'actorType');

  const actorIds = valueToArray(queryParams.actorIds ?? queryParams.actorId);
  appendInFilter(filters, params, actorIds, 'actor_id', 'actorId');

  const sources = valueToArray(queryParams.sources ?? queryParams.source);
  appendInFilter(filters, params, sources, 'source', 'source');

  const contextTypes = valueToArray(queryParams.contextTypes ?? queryParams.contextType);
  appendInFilter(filters, params, contextTypes, 'context_type', 'contextType');

  const contextIds = valueToArray(queryParams.contextIds ?? queryParams.contextId);
  appendInFilter(filters, params, contextIds, 'context_id', 'contextId');

  const legacyStackIds = valueToArray(queryParams.stackIds ?? queryParams.stackId);
  if (legacyStackIds.length) {
    const placeholders = legacyStackIds.map((_, idx) => {
      const key = `legacyStackId${idx}`;
      params[key] = legacyStackIds[idx];
      return `@${key}`;
    });
    filters.push(`(entity_type = 'stack' AND entity_id IN (${placeholders.join(', ')}))`);
  }

  const legacyEndpoints = valueToArray(queryParams.endpoints ?? queryParams.endpoint);
  if (legacyEndpoints.length) {
    const placeholders = legacyEndpoints.map((_, idx) => {
      const key = `legacyEndpoint${idx}`;
      params[key] = legacyEndpoints[idx];
      return `@${key}`;
    });
    filters.push(`(context_type = 'endpoint' AND context_id IN (${placeholders.join(', ')}))`);
  }

  const messageQuery = singleValue(queryParams.message ?? queryParams.text);
  if (messageQuery && String(messageQuery).trim()) {
    filters.push('message LIKE @message');
    params.message = `%${String(messageQuery).trim()}%`;
  }

  const search = singleValue(queryParams.search ?? queryParams.q);
  if (search && String(search).trim()) {
    filters.push('(message LIKE @search OR entity_name LIKE @search OR metadata LIKE @search)');
    params.search = `%${String(search).trim()}%`;
  }

  const from = singleValue(queryParams.from ?? queryParams.start);
  if (from) {
    filters.push('timestamp >= @from');
    params.from = from;
  }

  const to = singleValue(queryParams.to ?? queryParams.end);
  if (to) {
    filters.push('timestamp <= @to');
    params.to = to;
  }

  return {
    whereClause: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
    params
  };
}

const insertEventLogStmt = db.prepare(`
  INSERT INTO event_logs (
    timestamp,
    category,
    event_type,
    action,
    status,
    severity,
    entity_type,
    entity_id,
    entity_name,
    actor_type,
    actor_id,
    actor_name,
    source,
    context_type,
    context_id,
    context_label,
    message,
    metadata
  )
  VALUES (
    COALESCE(@timestamp, CURRENT_TIMESTAMP),
    @category,
    @eventType,
    @action,
    @status,
    @severity,
    @entityType,
    @entityId,
    @entityName,
    @actorType,
    @actorId,
    @actorName,
    @source,
    @contextType,
    @contextId,
    @contextLabel,
    @message,
    @metadata
  )
`);

export function logEvent(event = {}) {
  if (!event.category) {
    console.error('⚠️ logEvent wurde ohne Kategorie aufgerufen');
    return;
  }

  try {
    insertEventLogStmt.run({
      timestamp: event.timestamp ?? null,
      category: event.category,
      eventType: event.eventType ?? null,
      action: event.action ?? null,
      status: event.status ?? null,
      severity: event.severity ?? null,
      entityType: event.entityType ?? null,
      entityId: event.entityId !== undefined && event.entityId !== null ? String(event.entityId) : null,
      entityName: event.entityName ?? null,
      actorType: event.actorType ?? null,
      actorId: event.actorId !== undefined && event.actorId !== null ? String(event.actorId) : null,
      actorName: event.actorName ?? null,
      source: event.source ?? null,
      contextType: event.contextType ?? null,
      contextId: event.contextId !== undefined && event.contextId !== null ? String(event.contextId) : null,
      contextLabel: event.contextLabel ?? null,
      message: event.message ?? null,
      metadata: serializeJson(event.metadata)
    });
  } catch (err) {
    console.error('❌ Fehler beim Speichern des Event-Logs:', err.message);
  }
}

export function deleteEventLogById(id) {
  const stmt = db.prepare('DELETE FROM event_logs WHERE id = ?');
  const info = stmt.run(id);
  return info.changes || 0;
}

export function deleteEventLogsByFilters(queryParams = {}) {
  const { whereClause, params } = buildEventLogFilter(queryParams);
  const stmt = db.prepare(`DELETE FROM event_logs ${whereClause}`);
  const info = stmt.run(params);
  return info.changes || 0;
}

export function exportEventLogsByFilters(queryParams = {}, format = 'txt') {
  const { whereClause, params } = buildEventLogFilter(queryParams);
  const rows = db.prepare(`
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
  `).all(params);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (format === 'sql') {
    const columns = [
      'id',
      'timestamp',
      'category',
      'event_type',
      'action',
      'status',
      'severity',
      'entity_type',
      'entity_id',
      'entity_name',
      'actor_type',
      'actor_id',
      'actor_name',
      'source',
      'context_type',
      'context_id',
      'context_label',
      'message',
      'metadata'
    ];

    const statements = rows.map((row) => {
      const values = columns.map((column) => {
        const key = {
          event_type: 'eventType',
          entity_type: 'entityType',
          entity_id: 'entityId',
          entity_name: 'entityName',
          actor_type: 'actorType',
          actor_id: 'actorId',
          actor_name: 'actorName',
          context_type: 'contextType',
          context_id: 'contextId',
          context_label: 'contextLabel'
        }[column] ?? column;
        const value = row[key];
        if (value === null || value === undefined) return 'NULL';
        return `'${String(value).replace(/'/g, "''")}'`;
      });
      return `INSERT INTO event_logs (${columns.join(', ')}) VALUES (${values.join(', ')});`;
    });

    return {
      filename: `event-logs-${timestamp}.sql`,
      contentType: 'application/sql; charset=utf-8',
      content: statements.join('\n')
    };
  }

  const lines = rows.map((row) => {
    const parts = [
      `[${row.id}]`,
      row.timestamp,
      `Kategorie: ${row.category}`,
      row.eventType ? `Typ: ${row.eventType}` : null,
      row.action ? `Aktion: ${row.action}` : null,
      row.status ? `Status: ${row.status}` : null,
      row.entityName ? `Entität: ${row.entityName}${row.entityId ? ` (#${row.entityId})` : ''}` : row.entityId ? `Entität-ID: ${row.entityId}` : null,
      row.contextType ? `Kontext: ${row.contextType}${row.contextId ? ` (#${row.contextId}${row.contextLabel ? ` – ${row.contextLabel}` : ''})` : ''}` : null,
      row.message ? `Nachricht: ${row.message}` : null,
      row.metadata ? `Metadaten: ${row.metadata}` : null
    ].filter(Boolean);
    return parts.join(' | ');
  });

  return {
    filename: `event-logs-${timestamp}.txt`,
    contentType: 'text/plain; charset=utf-8',
    content: lines.join('\n')
  };
}
