import { db } from '../db/index.js';
import { logEvent } from '../logging/eventLogs.js';
import {
  hashPassword,
  normalizeAvatarColor,
  pickRandomAvatarColor,
  DEFAULT_AVATAR_COLOR,
  SUPERUSER_GROUP_NAME
} from '../auth/superuser.js';

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

const selectUserCredentialsById = db.prepare(`
  SELECT id, username, email, password_hash, password_salt, avatar_color
  FROM users
  WHERE id = ?
`);

const selectUserByUsername = db.prepare('SELECT id FROM users WHERE username = ?');
const selectUserByEmail = db.prepare('SELECT id FROM users WHERE email = ?');

const deleteMembershipsByUser = db.prepare(`
  DELETE FROM user_group_memberships
  WHERE user_id = ?
`);

const insertMembershipForUser = db.prepare(`
  INSERT OR IGNORE INTO user_group_memberships (user_id, group_id)
  VALUES (?, ?)
`);

const selectGroupById = db.prepare('SELECT id, name FROM user_groups WHERE id = ?');
const selectGroupIdByName = db.prepare('SELECT id FROM user_groups WHERE lower(name) = lower(?) LIMIT 1');

const isUserInGroupStatement = db.prepare(`
  SELECT 1 AS has_membership
  FROM user_group_memberships m
  INNER JOIN user_groups g ON g.id = m.group_id
  WHERE m.user_id = ? AND lower(g.name) = lower(?)
  LIMIT 1
`);

const insertUserStatement = db.prepare(`
  INSERT INTO users (username, email, password_hash, password_salt, avatar_color, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);

const updateUserCoreStatement = db.prepare(`
  UPDATE users
  SET username = ?,
      email = ?,
      password_hash = ?,
      password_salt = ?,
      avatar_color = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const updateUserActiveStatement = db.prepare(`
  UPDATE users
  SET is_active = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

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
  email: row.email || null,
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

const insertUserWithGroups = db.transaction(({ username, email, passwordHash, passwordSalt, avatarColor, groupId }) => {
  const result = insertUserStatement.run(username, email, passwordHash, passwordSalt, avatarColor);
  const userId = Number(result.lastInsertRowid);
  applyUserGroupAssignments(userId, [groupId]);
  return userId;
});

const resolveActorFields = (actor) => {
  if (!actor || actor.id === undefined || actor.id === null) {
    return {};
  }
  const name = actor.username || actor.email || `User ${actor.id}`;
  return {
    actorType: 'user',
    actorId: String(actor.id),
    actorName: name
  };
};

const normalizeEmail = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toLowerCase();
};

export function createUser({ username, email, password, groupId, avatarColor }, options = {}) {
  const actor = options.actor || null;
  const normalizedUsername = typeof username === 'string' ? username.trim() : '';
  if (!normalizedUsername) {
    const error = new Error('USERNAME_REQUIRED');
    error.code = 'USERNAME_REQUIRED';
    throw error;
  }

  const numericGroupId = Number(groupId);
  if (!Number.isFinite(numericGroupId) || numericGroupId <= 0) {
    const error = new Error('INVALID_GROUP_ID');
    error.code = 'INVALID_GROUP_ID';
    throw error;
  }

  const groupRow = selectGroupById.get(numericGroupId);
  if (!groupRow) {
    const error = new Error('GROUP_NOT_FOUND');
    error.code = 'GROUP_NOT_FOUND';
    throw error;
  }

  if ((groupRow.name || '').toLowerCase() === SUPERUSER_GROUP_NAME) {
    const error = new Error('GROUP_SUPERUSER_PROTECTED');
    error.code = 'GROUP_SUPERUSER_PROTECTED';
    throw error;
  }

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail && !normalizedEmail.includes('@')) {
    const error = new Error('INVALID_EMAIL');
    error.code = 'INVALID_EMAIL';
    throw error;
  }

  const existingUsername = selectUserByUsername.get(normalizedUsername);
  if (existingUsername) {
    const error = new Error('USERNAME_TAKEN');
    error.code = 'USERNAME_TAKEN';
    throw error;
  }

  if (normalizedEmail) {
    const existingEmail = selectUserByEmail.get(normalizedEmail);
    if (existingEmail) {
      const error = new Error('EMAIL_TAKEN');
      error.code = 'EMAIL_TAKEN';
      throw error;
    }
  }

  let passwordHash;
  let passwordSalt;
  try {
    const hashed = hashPassword(password);
    passwordHash = hashed.hash;
    passwordSalt = hashed.salt;
  } catch (err) {
    if (err && err.code) {
      throw err;
    }
    const error = new Error('INVALID_PASSWORD');
    error.code = 'INVALID_PASSWORD';
    throw error;
  }

  const normalizedAvatarColor = normalizeAvatarColor(avatarColor);
  const avatarColorToPersist = normalizedAvatarColor || pickRandomAvatarColor() || DEFAULT_AVATAR_COLOR;

  const userId = insertUserWithGroups({
    username: normalizedUsername,
    email: normalizedEmail,
    passwordHash,
    passwordSalt,
    avatarColor: avatarColorToPersist,
    groupId: numericGroupId
  });

  const userRecord = getUserById(userId);

  logEvent({
    category: 'benutzer',
    eventType: 'benutzer-angelegt',
    action: 'anlegen',
    status: 'erfolgreich',
    entityType: 'benutzer',
    entityId: String(userRecord?.id ?? userId),
    entityName: userRecord?.username ?? normalizedUsername,
    message: `Benutzer "${normalizedUsername}" angelegt`,
    metadata: {
      email: userRecord?.email ?? normalizedEmail ?? null,
      primaryGroupId: numericGroupId,
      primaryGroupName: groupRow.name
    },
    ...resolveActorFields(actor)
  });

  return userRecord;
}

export function updateUserGroups(userId, groupIds, options = {}) {
  const actor = options.actor || null;
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
  const groupDetails = [];
  normalizedGroupIds.forEach((groupId) => {
    const groupRow = selectGroupById.get(groupId);
    if (!groupRow) {
      missingGroupIds.push(groupId);
    } else {
      groupDetails.push({
        id: groupId,
        name: groupRow.name
      });
    }
  });

  if (missingGroupIds.length > 0) {
    const error = new Error('GROUP_NOT_FOUND');
    error.code = 'GROUP_NOT_FOUND';
    error.missingGroupIds = missingGroupIds;
    throw error;
  }

  applyUserGroupAssignments(numericUserId, normalizedGroupIds);
  const updated = getUserById(numericUserId);

  logEvent({
    category: 'benutzer',
    eventType: 'benutzer-gruppen-aktualisiert',
    action: 'gruppe-aktualisieren',
    status: 'erfolgreich',
    entityType: 'benutzer',
    entityId: String(numericUserId),
    entityName: updated?.username ?? existingUser.username ?? `ID ${numericUserId}`,
    message: `Gruppenzuordnung für Benutzer "${updated?.username ?? existingUser.username ?? numericUserId}" aktualisiert`,
    metadata: {
      previousGroups: (existingUser.groups || []).map((group) => ({ id: group.id, name: group.name })),
      groups: updated?.groups?.map((group) => ({ id: group.id, name: group.name })) ?? groupDetails
    },
    ...resolveActorFields(actor)
  });

  return updated;
}

export function updateUserDetails(userId, { username, email, password, avatarColor, groupId, groupIds } = {}, options = {}) {
  const actor = options.actor || null;
  const numericUserId = Number(userId);
  if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
    const error = new Error('INVALID_USER_ID');
    error.code = 'INVALID_USER_ID';
    throw error;
  }

  const existingUser = selectUserCredentialsById.get(numericUserId);
  if (!existingUser) {
    const error = new Error('USER_NOT_FOUND');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  const previousUserRecord = getUserById(numericUserId);

  const normalizedUsername = typeof username === 'string' ? username.trim() : existingUser.username;
  if (!normalizedUsername) {
    const error = new Error('USERNAME_REQUIRED');
    error.code = 'USERNAME_REQUIRED';
    throw error;
  }

  const usernameRow = selectUserByUsername.get(normalizedUsername);
  if (usernameRow && Number(usernameRow.id) !== numericUserId) {
    const error = new Error('USERNAME_TAKEN');
    error.code = 'USERNAME_TAKEN';
    throw error;
  }

  const normalizedEmail = email === undefined ? existingUser.email : normalizeEmail(email);
  if (normalizedEmail && !normalizedEmail.includes('@')) {
    const error = new Error('INVALID_EMAIL');
    error.code = 'INVALID_EMAIL';
    throw error;
  }

  if (normalizedEmail) {
    const emailRow = selectUserByEmail.get(normalizedEmail);
    if (emailRow && Number(emailRow.id) !== numericUserId) {
      const error = new Error('EMAIL_TAKEN');
      error.code = 'EMAIL_TAKEN';
      throw error;
    }
  }

  let passwordHash = existingUser.password_hash;
  let passwordSalt = existingUser.password_salt;
  if (typeof password === 'string') {
    const trimmedPassword = password.trim();
    if (trimmedPassword.length > 0) {
      const hashed = hashPassword(trimmedPassword);
      passwordHash = hashed.hash;
      passwordSalt = hashed.salt;
    }
  } else if (password !== undefined && password !== null) {
    const error = new Error('INVALID_PASSWORD');
    error.code = 'INVALID_PASSWORD';
    throw error;
  }

  let colorToPersist = existingUser.avatar_color || DEFAULT_AVATAR_COLOR;
  if (avatarColor !== undefined) {
    const candidate = String(avatarColor || '').trim();
    if (!candidate) {
      colorToPersist = DEFAULT_AVATAR_COLOR;
    } else {
      const normalizedColor = normalizeAvatarColor(candidate);
      if (!normalizedColor) {
        const error = new Error('INVALID_AVATAR_COLOR');
        error.code = 'INVALID_AVATAR_COLOR';
        throw error;
      }
      colorToPersist = normalizedColor;
    }
  }

  const shouldUpdateGroups = groupId !== undefined || groupIds !== undefined;
  let normalizedGroupIds = null;
  let nextGroups = null;
  if (shouldUpdateGroups) {
    const incomingGroupIds = Array.isArray(groupIds)
      ? groupIds
      : groupId !== undefined && groupId !== null
        ? [groupId]
        : [];

    normalizedGroupIds = Array.from(
      new Set(
        incomingGroupIds
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0)
      )
    );

    const missingGroupIds = [];
    nextGroups = [];
    normalizedGroupIds.forEach((value) => {
      const groupRow = selectGroupById.get(value);
      if (!groupRow) {
        missingGroupIds.push(value);
      } else {
        nextGroups.push({ id: value, name: groupRow.name });
      }
    });

    if (missingGroupIds.length > 0) {
      const error = new Error('GROUP_NOT_FOUND');
      error.code = 'GROUP_NOT_FOUND';
      error.missingGroupIds = missingGroupIds;
      throw error;
    }
  }

  const performUpdate = db.transaction(() => {
    updateUserCoreStatement.run(
      normalizedUsername,
      normalizedEmail,
      passwordHash,
      passwordSalt,
      colorToPersist,
      numericUserId
    );

    if (normalizedGroupIds !== null) {
      applyUserGroupAssignments(numericUserId, normalizedGroupIds);
    }
  });

  performUpdate();
  const updatedUser = getUserById(numericUserId);

  logEvent({
    category: 'benutzer',
    eventType: 'benutzer-aktualisiert',
    action: 'aktualisieren',
    status: 'erfolgreich',
    entityType: 'benutzer',
    entityId: String(numericUserId),
    entityName: updatedUser?.username ?? normalizedUsername,
    message: `Benutzer "${updatedUser?.username ?? normalizedUsername}" aktualisiert`,
    metadata: {
      email: updatedUser?.email ?? normalizedEmail ?? null,
      groupsUpdated: normalizedGroupIds !== null
        ? (updatedUser?.groups?.map((group) => ({ id: group.id, name: group.name })) ?? nextGroups)
        : undefined,
      previousGroups: normalizedGroupIds !== null
        ? (previousUserRecord?.groups || []).map((group) => ({ id: group.id, name: group.name }))
        : undefined,
      avatarColor: updatedUser?.avatarColor ?? colorToPersist
    },
    ...resolveActorFields(actor)
  });

  return updatedUser;
}

const deleteMembershipsStatement = db.prepare(`
  DELETE FROM user_group_memberships
  WHERE user_id = ?
`);

const deleteUserStatement = db.prepare(`
  DELETE FROM users
  WHERE id = ?
`);

export function deleteUser(userId, options = {}) {
  const actor = options.actor || null;
  const numericUserId = Number(userId);
  if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
    const error = new Error('INVALID_USER_ID');
    error.code = 'INVALID_USER_ID';
    throw error;
  }

  const existingUser = selectUserCredentialsById.get(numericUserId);
  if (!existingUser) {
    const error = new Error('USER_NOT_FOUND');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  const superuserMembership = isUserInGroupStatement.get(numericUserId, SUPERUSER_GROUP_NAME);
  if (superuserMembership && superuserMembership.has_membership) {
    const error = new Error('USER_SUPERUSER_PROTECTED');
    error.code = 'USER_SUPERUSER_PROTECTED';
    throw error;
  }

  const performDelete = db.transaction(() => {
    deleteMembershipsStatement.run(numericUserId);
    deleteUserStatement.run(numericUserId);
  });

  performDelete();

  logEvent({
    category: 'benutzer',
    eventType: 'benutzer-gelöscht',
    action: 'gelöscht',
    status: 'erfolgreich',
    entityType: 'benutzer',
    entityId: String(numericUserId),
    entityName: existingUser.username ?? `ID ${numericUserId}`,
    message: `Benutzer "${existingUser.username ?? numericUserId}" gelöscht`,
    metadata: {
      email: existingUser.email ?? null
    },
    ...resolveActorFields(actor)
  });
}

export function updateUserActiveStatus(userId, isActive, options = {}) {
  const actor = options.actor || null;
  const numericUserId = Number(userId);
  if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
    const error = new Error('INVALID_USER_ID');
    error.code = 'INVALID_USER_ID';
    throw error;
  }

  const existingUser = selectUserCredentialsById.get(numericUserId);
  if (!existingUser) {
    const error = new Error('USER_NOT_FOUND');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  const superuserMembership = isUserInGroupStatement.get(numericUserId, SUPERUSER_GROUP_NAME);
  if (superuserMembership && superuserMembership.has_membership && !isActive) {
    const error = new Error('USER_SUPERUSER_PROTECTED');
    error.code = 'USER_SUPERUSER_PROTECTED';
    throw error;
  }

  const normalizedIsActive = isActive ? 1 : 0;
  updateUserActiveStatement.run(normalizedIsActive, numericUserId);
  const updated = getUserById(numericUserId);

  logEvent({
    category: 'benutzer',
    eventType: normalizedIsActive ? 'benutzer-aktiviert' : 'benutzer-deaktiviert',
    action: 'status-aktualisieren',
    status: 'erfolgreich',
    entityType: 'benutzer',
    entityId: String(numericUserId),
    entityName: updated?.username ?? existingUser.username ?? `ID ${numericUserId}`,
    message: normalizedIsActive
      ? `Benutzer "${updated?.username ?? existingUser.username ?? numericUserId}" aktiviert`
      : `Benutzer "${updated?.username ?? existingUser.username ?? numericUserId}" deaktiviert`,
    metadata: {
      isActive: Boolean(normalizedIsActive)
    },
    ...resolveActorFields(actor)
  });

  return updated;
}
