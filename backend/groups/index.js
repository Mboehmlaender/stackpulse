import { db } from '../db/index.js';

const selectGroupsWithMembers = db.prepare(`
  SELECT
    g.id,
    g.name,
    g.description,
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

const selectGroupIdByName = db.prepare(`
  SELECT id
  FROM user_groups
  WHERE lower(name) = lower(?)
  LIMIT 1
`);

const insertGroupStatement = db.prepare(`
  INSERT INTO user_groups (name, description, created_at, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
  memberCount: Number(row.member_count) || 0,
  members: parseMembers(row.member_pairs)
});

export function listGroups() {
  const rows = selectGroupsWithMembers.all();
  return rows.map(sanitizeGroup);
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
  const insertResult = insertGroupStatement.run(normalizedName, normalizedDescription || null);
  const groupId = Number(insertResult.lastInsertRowid);
  const row = selectGroupWithMembersById.get(groupId);
  return row ? sanitizeGroup(row) : null;
}
