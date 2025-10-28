import { db } from '../db/index.js';

const selectUsersWithGroups = db.prepare(`
  SELECT
    u.id,
    u.username,
    u.email,
    u.is_active,
    u.avatar_color,
    u.last_login,
    u.created_at,
    u.updated_at,
    GROUP_CONCAT(g.id || '::' || g.name, '|||') AS group_pairs
  FROM users u
  LEFT JOIN user_group_memberships m ON m.user_id = u.id
  LEFT JOIN user_groups g ON g.id = m.group_id
  GROUP BY u.id
  ORDER BY u.username COLLATE NOCASE
`);

const selectUserWithGroupsById = db.prepare(`
  SELECT
    u.id,
    u.username,
    u.email,
    u.is_active,
    u.avatar_color,
    u.last_login,
    u.created_at,
    u.updated_at,
    GROUP_CONCAT(g.id || '::' || g.name, '|||') AS group_pairs
  FROM users u
  LEFT JOIN user_group_memberships m ON m.user_id = u.id
  LEFT JOIN user_groups g ON g.id = m.group_id
  WHERE u.id = ?
  GROUP BY u.id
`);

const deleteMembershipsByUser = db.prepare(`
  DELETE FROM user_group_memberships
  WHERE user_id = ?
`);

const insertMembershipForUser = db.prepare(`
  INSERT OR IGNORE INTO user_group_memberships (user_id, group_id)
  VALUES (?, ?)
`);

const selectGroupById = db.prepare('SELECT id, name FROM user_groups WHERE id = ?');

const parseGroupPairs = (rawPairs) => {
  if (!rawPairs) {
    return [];
  }
  return rawPairs
    .split('|||')
    .map((entry) => {
      const [idPart, namePart] = entry.split('::');
      const groupName = String(namePart || '').trim();
      if (!groupName) {
        return null;
      }
      const numericId = Number(idPart);
      return {
        id: Number.isFinite(numericId) ? numericId : null,
        name: groupName
      };
    })
    .filter(Boolean);
};

const sanitizeUserRecord = (row) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  isActive: Boolean(row.is_active),
  avatarColor: row.avatar_color || null,
  lastLogin: row.last_login || null,
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
  groups: parseGroupPairs(row.group_pairs)
});

export function listUsers() {
  const rows = selectUsersWithGroups.all();
  return rows.map(sanitizeUserRecord);
}

export function getUserById(userId) {
  const row = selectUserWithGroupsById.get(userId);
  return row ? sanitizeUserRecord(row) : null;
}

const applyUserGroupAssignments = db.transaction((userId, groupIds) => {
  deleteMembershipsByUser.run(userId);
  groupIds.forEach((groupId) => {
    insertMembershipForUser.run(userId, groupId);
  });
});

export function updateUserGroups(userId, groupIds) {
  const numericUserId = Number(userId);
  if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
    const error = new Error('INVALID_USER_ID');
    error.code = 'INVALID_USER_ID';
    throw error;
  }

  const existingUser = getUserById(numericUserId);
  if (!existingUser) {
    const error = new Error('USER_NOT_FOUND');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  const normalizedGroupIds = Array.isArray(groupIds)
    ? Array.from(
      new Set(
        groupIds
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0)
      )
    )
    : [];

  const missingGroupIds = [];
  normalizedGroupIds.forEach((groupId) => {
    const groupRow = selectGroupById.get(groupId);
    if (!groupRow) {
      missingGroupIds.push(groupId);
    }
  });

  if (missingGroupIds.length > 0) {
    const error = new Error('GROUP_NOT_FOUND');
    error.code = 'GROUP_NOT_FOUND';
    error.missingGroupIds = missingGroupIds;
    throw error;
  }

  applyUserGroupAssignments(numericUserId, normalizedGroupIds);
  return getUserById(numericUserId);
}
