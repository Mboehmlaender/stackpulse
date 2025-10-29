import { db } from '../db/index.js';
import {
  normalizeAvatarColor,
  DEFAULT_AVATAR_COLOR,
  SUPERUSER_GROUP_NAME,
  pickRandomAvatarColor
} from '../auth/superuser.js';
import { logEvent } from '../logging/eventLogs.js';

const selectGroupsWithMembers = db.prepare(`
  SELECT
    g.id,
    g.name,
    g.description,
    g.avatar_color,
    g.created_at,
    g.updated_at,
    COUNT(DISTINCT u.id) AS member_count,
    GROUP_CONCAT(u.id || '::' || u.username, '|||') AS member_pairs
  FROM user_groups g
  LEFT JOIN user_group_memberships m ON m.group_id = g.id
  LEFT JOIN users u ON u.id = m.user_id
  GROUP BY g.id
  ORDER BY g.name COLLATE NOCASE
`);

const selectGroupWithMembersById = db.prepare(`
  SELECT
    g.id,
    g.name,
    g.description,
    g.avatar_color,
    g.created_at,
    g.updated_at,
    COUNT(DISTINCT u.id) AS member_count,
    GROUP_CONCAT(u.id || '::' || u.username, '|||') AS member_pairs
  FROM user_groups g
  LEFT JOIN user_group_memberships m ON m.group_id = g.id
  LEFT JOIN users u ON u.id = m.user_id
  WHERE g.id = ?
  GROUP BY g.id
`);

const selectGroupByIdBasic = db.prepare(`
  SELECT id, name, description, avatar_color
  FROM user_groups
  WHERE id = ?
`);

const selectGroupIdByName = db.prepare(`
  SELECT id
  FROM user_groups
  WHERE lower(name) = lower(?)
  LIMIT 1
`);

const insertGroupStatement = db.prepare(`
  INSERT INTO user_groups (name, description, avatar_color, created_at, updated_at)
  VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);

const updateGroupStatement = db.prepare(`
  UPDATE user_groups
  SET name = ?,
      description = ?,
      avatar_color = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const countGroupMembersStatement = db.prepare(`
  SELECT COUNT(*) AS member_count
  FROM user_group_memberships
  WHERE group_id = ?
`);

const deleteGroupStatement = db.prepare(`
  DELETE FROM user_groups
  WHERE id = ?
`);

const parseMembers = (rawPairs) => {
  if (!rawPairs) {
    return [];
  }

  return rawPairs
    .split('|||')
    .map((entry) => {
      const [idPart, usernamePart] = entry.split('::');
      const numericId = Number(idPart);
      return {
        id: Number.isFinite(numericId) ? numericId : idPart,
        username: (usernamePart || '').trim()
      };
    })
    .filter((member) => member.username);
};

const sanitizeGroup = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description || '',
  avatarColor: row.avatar_color || null,
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
  memberCount: Number(row.member_count) || 0,
  members: parseMembers(row.member_pairs)
});

export function listGroups() {
  const rows = selectGroupsWithMembers.all();
  return rows.map(sanitizeGroup);
}

export function getGroupById(groupId) {
  const numericId = Number(groupId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return null;
  }
  const row = selectGroupWithMembersById.get(numericId);
  return row ? sanitizeGroup(row) : null;
}

export function createGroup({ name, description }) {
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (!normalizedName) {
    const error = new Error('GROUP_NAME_REQUIRED');
    error.code = 'GROUP_NAME_REQUIRED';
    throw error;
  }

  const existing = selectGroupIdByName.get(normalizedName);
  if (existing) {
    const error = new Error('GROUP_NAME_TAKEN');
    error.code = 'GROUP_NAME_TAKEN';
    throw error;
  }

  const normalizedDescription = typeof description === 'string' ? description.trim() : null;
  const avatarColor = pickRandomAvatarColor() || DEFAULT_AVATAR_COLOR;
  const insertResult = insertGroupStatement.run(normalizedName, normalizedDescription || null, avatarColor);
  const groupId = Number(insertResult.lastInsertRowid);
  const row = selectGroupWithMembersById.get(groupId);
  const group = row ? sanitizeGroup(row) : null;

  logEvent({
    category: 'benutzergruppe',
    eventType: 'gruppe-angelegt',
    action: 'anlegen',
    status: 'erfolgreich',
    entityType: 'gruppe',
    entityId: String(groupId),
    entityName: group?.name ?? normalizedName,
    message: `Benutzergruppe "${normalizedName}" angelegt`,
    metadata: {
      description: group?.description ?? normalizedDescription ?? null,
      avatarColor
    }
  });

  return group;
}

export function updateGroupDetails(groupId, { name, description, avatarColor } = {}) {
  const numericId = Number(groupId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    const error = new Error('INVALID_GROUP_ID');
    error.code = 'INVALID_GROUP_ID';
    throw error;
  }

  const existingRow = selectGroupByIdBasic.get(numericId);
  if (!existingRow) {
    const error = new Error('GROUP_NOT_FOUND');
    error.code = 'GROUP_NOT_FOUND';
    throw error;
  }

  const normalizedName = typeof name === 'string' ? name.trim() : existingRow.name || '';
  if (!normalizedName) {
    const error = new Error('GROUP_NAME_REQUIRED');
    error.code = 'GROUP_NAME_REQUIRED';
    throw error;
  }

  const nameRow = selectGroupIdByName.get(normalizedName);
  if (nameRow && Number(nameRow.id) !== numericId) {
    const error = new Error('GROUP_NAME_TAKEN');
    error.code = 'GROUP_NAME_TAKEN';
    throw error;
  }

  let normalizedDescription;
  if (description === undefined) {
    normalizedDescription = existingRow.description ?? null;
  } else if (description === null) {
    normalizedDescription = null;
  } else {
    const trimmedDescription = typeof description === 'string' ? description.trim() : '';
    normalizedDescription = trimmedDescription ? trimmedDescription : null;
  }

  const isSuperuserGroup = (existingRow.name || '').toLowerCase() === SUPERUSER_GROUP_NAME;

  if (isSuperuserGroup) {
    if (name !== undefined) {
      const incomingName = typeof name === 'string' ? name.trim() : '';
      if (incomingName && incomingName !== existingRow.name) {
        const error = new Error('GROUP_SUPERUSER_PROTECTED');
        error.code = 'GROUP_SUPERUSER_PROTECTED';
        throw error;
      }
    }

    if (description !== undefined) {
      const existingDescriptionComparable = existingRow.description === null || existingRow.description === undefined
        ? ''
        : String(existingRow.description).trim();
      const incomingDescriptionComparable = description === null
        ? ''
        : typeof description === 'string'
          ? description.trim()
          : '';

      if (incomingDescriptionComparable !== existingDescriptionComparable) {
        const error = new Error('GROUP_SUPERUSER_PROTECTED');
        error.code = 'GROUP_SUPERUSER_PROTECTED';
        throw error;
      }
    }

    // Enforce original values for protected fields
    normalizedDescription = existingRow.description ?? null;
  }

  let colorToPersist = existingRow.avatar_color || null;
  if (avatarColor !== undefined) {
    const candidate = String(avatarColor || '').trim();
    if (!candidate) {
      colorToPersist = DEFAULT_AVATAR_COLOR;
    } else {
      const normalized = normalizeAvatarColor(candidate);
      if (!normalized) {
        const error = new Error('INVALID_AVATAR_COLOR');
        error.code = 'INVALID_AVATAR_COLOR';
        throw error;
      }
      colorToPersist = normalized;
    }
  }

  updateGroupStatement.run(
    isSuperuserGroup ? existingRow.name : normalizedName,
    normalizedDescription,
    colorToPersist,
    numericId
  );

  const updatedGroup = getGroupById(numericId);

  logEvent({
    category: 'benutzergruppe',
    eventType: 'gruppe-aktualisiert',
    action: 'aktualisieren',
    status: 'erfolgreich',
    entityType: 'gruppe',
    entityId: String(numericId),
    entityName: updatedGroup?.name ?? normalizedName,
    message: `Benutzergruppe "${updatedGroup?.name ?? normalizedName}" aktualisiert`,
    metadata: {
      previous: {
        name: existingRow.name,
        description: existingRow.description ?? null,
        avatarColor: existingRow.avatar_color ?? null
      },
      current: updatedGroup
        ? {
            name: updatedGroup.name,
            description: updatedGroup.description ?? null,
            avatarColor: updatedGroup.avatarColor ?? null,
            memberCount: updatedGroup.memberCount ?? 0
          }
        : {
            name: normalizedName,
            description: normalizedDescription ?? null,
            avatarColor: colorToPersist
          }
    }
  });

  return updatedGroup;
}

export function deleteGroup(groupId) {
  const numericId = Number(groupId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    const error = new Error('INVALID_GROUP_ID');
    error.code = 'INVALID_GROUP_ID';
    throw error;
  }

  const existingRow = selectGroupByIdBasic.get(numericId);
  if (!existingRow) {
    const error = new Error('GROUP_NOT_FOUND');
    error.code = 'GROUP_NOT_FOUND';
    throw error;
  }

  const isSuperuserGroup = (existingRow.name || '').toLowerCase() === SUPERUSER_GROUP_NAME;
  if (isSuperuserGroup) {
    const error = new Error('GROUP_SUPERUSER_PROTECTED');
    error.code = 'GROUP_SUPERUSER_PROTECTED';
    throw error;
  }

  const { member_count: memberCount } = countGroupMembersStatement.get(numericId);
  if (Number(memberCount) > 0) {
    const error = new Error('GROUP_HAS_MEMBERS');
    error.code = 'GROUP_HAS_MEMBERS';
    error.memberCount = Number(memberCount);
    throw error;
  }

  deleteGroupStatement.run(numericId);

  logEvent({
    category: 'benutzergruppe',
    eventType: 'gruppe-gelöscht',
    action: 'löschen',
    status: 'erfolgreich',
    entityType: 'gruppe',
    entityId: String(numericId),
    entityName: existingRow.name ?? `ID ${numericId}`,
    message: `Benutzergruppe "${existingRow.name ?? numericId}" gelöscht`,
    metadata: {
      description: existingRow.description ?? null,
      avatarColor: existingRow.avatar_color ?? null,
      memberCountBeforeDelete: Number(memberCount)
    }
  });
}
