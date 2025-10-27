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
