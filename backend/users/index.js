import { db } from '../db/index.js';

const selectUsersWithGroups = db.prepare(`
  SELECT
    u.id,
    u.username,
    u.email,
    u.is_active,
    u.last_login,
    u.created_at,
    u.updated_at,
    GROUP_CONCAT(g.name, '|||') AS group_names
  FROM users u
  LEFT JOIN user_group_memberships m ON m.user_id = u.id
  LEFT JOIN user_groups g ON g.id = m.group_id
  GROUP BY u.id
  ORDER BY u.username COLLATE NOCASE
`);

const normalizeGroupNames = (rawNames) => {
  if (!rawNames) {
    return [];
  }
  return rawNames
    .split('|||')
    .map((name) => String(name || '').trim())
    .filter(Boolean);
};

const sanitizeUserRecord = (row) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  isActive: Boolean(row.is_active),
  lastLogin: row.last_login || null,
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
  groups: normalizeGroupNames(row.group_names)
});

export function listUsers() {
  const rows = selectUsersWithGroups.all();
  return rows.map(sanitizeUserRecord);
}
