import { db } from '../db/index.js';
import { logEvent } from '../logging/eventLogs.js';
import {
  generateSecurityPhraseWords,
  encryptSecurityPhrase,
  decryptSecurityPhrase,
  canonicalizeWords,
  canonicalizePhraseInput
} from './securityPhrase.js';
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
    u.security_phrase_downloaded_at,
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
    u.security_phrase_content,
    u.security_phrase_iv,
    u.security_phrase_tag,
    u.security_phrase_downloaded_at,
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

const selectServerByIdForAssignment = db.prepare('SELECT id, name, url FROM servers WHERE id = ?');

const selectAssignmentsByUser = db.prepare(`
  SELECT
    usa.user_id,
    usa.server_id,
    usa.group_id,
    usa.use_global_group,
    usa.created_at,
    usa.updated_at,
    s.name AS server_name,
    s.url AS server_url,
    g.name AS group_name
  FROM user_server_assignments usa
  JOIN servers s ON s.id = usa.server_id
  LEFT JOIN user_groups g ON g.id = usa.group_id
  WHERE usa.user_id = ?
  ORDER BY s.name ASC, usa.server_id ASC
`);

const upsertUserServerAssignment = db.prepare(`
  INSERT INTO user_server_assignments (
    user_id,
    server_id,
    group_id,
    use_global_group,
    created_at,
    updated_at
  ) VALUES (
    ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  ON CONFLICT(user_id, server_id) DO UPDATE SET
    group_id = excluded.group_id,
    use_global_group = excluded.use_global_group,
    updated_at = CURRENT_TIMESTAMP
`);

const deleteUserServerAssignments = db.prepare(`
  DELETE FROM user_server_assignments
  WHERE user_id = ?
`);

const selectSecurityPhraseByUsername = db.prepare(`
  SELECT
    id,
    username,
    is_active,
    security_phrase_content AS content,
    security_phrase_iv AS iv,
    security_phrase_tag AS tag,
    security_phrase_downloaded_at AS downloaded_at
  FROM users
  WHERE lower(username) = lower(?)
  LIMIT 1
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
  INSERT INTO users (
    username,
    email,
    password_hash,
    password_salt,
    avatar_color,
    is_active,
    security_phrase_content,
    security_phrase_iv,
    security_phrase_tag,
    security_phrase_downloaded_at,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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

const updateUserPasswordStatement = db.prepare(`
  UPDATE users
  SET password_hash = ?,
      password_salt = ?,
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
  groups: parseGroupPairs(row.group_pairs),
  securityPhraseDownloadedAt: row.security_phrase_downloaded_at || null
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

const insertUserWithGroups = db.transaction(({
  username,
  email,
  passwordHash,
  passwordSalt,
  avatarColor,
  groupId,
  securityPhrase
}) => {
  const phraseToPersist = securityPhrase && typeof securityPhrase === 'object'
    ? {
        content: securityPhrase.content ?? null,
        iv: securityPhrase.iv ?? null,
        tag: securityPhrase.tag ?? null
      }
    : { content: null, iv: null, tag: null };

  const result = insertUserStatement.run(
    username,
    email,
    passwordHash,
    passwordSalt,
    avatarColor,
    phraseToPersist.content,
    phraseToPersist.iv,
    phraseToPersist.tag
  );
  const userId = Number(result.lastInsertRowid);
  applyUserGroupAssignments(userId, [groupId]);
  return userId;
});

const selectSecurityPhraseByUserId = db.prepare(`
  SELECT
    id,
    username,
    security_phrase_content AS content,
    security_phrase_iv AS iv,
    security_phrase_tag AS tag,
    security_phrase_downloaded_at AS downloaded_at
  FROM users
  WHERE id = ?
`);

const updateSecurityPhraseStatement = db.prepare(`
  UPDATE users
  SET
    security_phrase_content = ?,
    security_phrase_iv = ?,
    security_phrase_tag = ?,
    security_phrase_downloaded_at = NULL,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const markSecurityPhraseDownloadedStatement = db.prepare(`
  UPDATE users
  SET security_phrase_downloaded_at = COALESCE(security_phrase_downloaded_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const selectUsersMissingSecurityPhraseStatement = db.prepare(`
  SELECT id
  FROM users
  WHERE security_phrase_content IS NULL
     OR security_phrase_iv IS NULL
     OR security_phrase_tag IS NULL
`);

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

export function getUserSecurityPhrase(userId, options = {}) {
  const numericUserId = Number(userId);
  if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
    const error = new Error('INVALID_USER_ID');
    error.code = 'INVALID_USER_ID';
    throw error;
  }

  const { actor = null, allowAutoGenerate = true } = options;

  const record = selectSecurityPhraseByUserId.get(numericUserId);
  if (!record) {
    const error = new Error('USER_NOT_FOUND');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  const words = decryptSecurityPhrase(record);

  if (allowAutoGenerate && (!Array.isArray(words) || words.length === 0)) {
    return renewUserSecurityPhrase(numericUserId, { actor, suppressLog: true });
  }

  return {
    userId: numericUserId,
    username: record.username,
    words,
    downloadedAt: record.downloaded_at || null
  };
}

export function renewUserSecurityPhrase(userId, options = {}) {
  const actor = options.actor || null;
  const suppressLog = Boolean(options.suppressLog);
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

  const previousPhraseRecord = selectSecurityPhraseByUserId.get(numericUserId);

  const words = generateSecurityPhraseWords(8);
  const { encrypted: encryptedPhrase } = encryptSecurityPhrase(words);

  updateSecurityPhraseStatement.run(
    encryptedPhrase.content,
    encryptedPhrase.iv,
    encryptedPhrase.tag,
    numericUserId
  );

  if (!suppressLog) {
    logEvent({
      category: 'benutzer',
      eventType: 'benutzer-sicherheitsschluessel-erneuert',
      action: 'sicherheitsschluessel-erneuern',
      status: 'erfolgreich',
      entityType: 'benutzer',
      entityId: String(numericUserId),
      entityName: existingUser.username ?? `ID ${numericUserId}`,
      message: `Sicherheitsschlüssel für Benutzer "${existingUser.username ?? numericUserId}" erneuert`,
      metadata: {
        previousDownloadedAt: previousPhraseRecord?.downloaded_at ?? null
      },
      ...resolveActorFields(actor)
    });
  }

  return {
    userId: numericUserId,
    username: existingUser.username,
    words,
    downloadedAt: null
  };
}

export function markSecurityPhraseDownloaded(userId, options = {}) {
  const actor = options.actor || null;
  const numericUserId = Number(userId);
  if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
    const error = new Error('INVALID_USER_ID');
    error.code = 'INVALID_USER_ID';
    throw error;
  }

  const record = selectSecurityPhraseByUserId.get(numericUserId);
  if (!record) {
    const error = new Error('USER_NOT_FOUND');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  markSecurityPhraseDownloadedStatement.run(numericUserId);

  const updatedRecord = selectSecurityPhraseByUserId.get(numericUserId) || record;
  const downloadedAt = updatedRecord?.downloaded_at || null;

  logEvent({
    category: 'benutzer',
    eventType: 'benutzer-sicherheitsschluessel-heruntergeladen',
    action: 'sicherheitsschluessel-herunterladen',
    status: 'erfolgreich',
    entityType: 'benutzer',
    entityId: String(numericUserId),
    entityName: record.username ?? `ID ${numericUserId}`,
    message: `Sicherheitsschlüssel für Benutzer "${record.username ?? numericUserId}" heruntergeladen`,
    metadata: {
      downloadedAt
    },
    ...resolveActorFields(actor)
  });

  return {
    userId: numericUserId,
    username: record.username,
    downloadedAt
  };
}

export function verifySecurityPhraseForUsername(username, phraseInput) {
  const normalizedUsername = typeof username === 'string' ? username.trim() : '';
  if (!normalizedUsername) {
    const error = new Error('USERNAME_REQUIRED');
    error.code = 'USERNAME_REQUIRED';
    throw error;
  }

  const record = selectSecurityPhraseByUsername.get(normalizedUsername);
  if (!record) {
    const error = new Error('USER_NOT_FOUND');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  const candidateCanonical = canonicalizePhraseInput(phraseInput);
  if (!candidateCanonical) {
    const error = new Error('PHRASE_REQUIRED');
    error.code = 'PHRASE_REQUIRED';
    throw error;
  }

  const words = decryptSecurityPhrase(record);
  if (!Array.isArray(words) || words.length === 0) {
    const error = new Error('PHRASE_NOT_INITIALIZED');
    error.code = 'PHRASE_NOT_INITIALIZED';
    throw error;
  }

  const storedCanonical = canonicalizeWords(words);
  if (!storedCanonical) {
    const error = new Error('PHRASE_NOT_INITIALIZED');
    error.code = 'PHRASE_NOT_INITIALIZED';
    throw error;
  }

  if (storedCanonical !== candidateCanonical) {
    const error = new Error('PHRASE_MISMATCH');
    error.code = 'PHRASE_MISMATCH';
    throw error;
  }

  return {
    userId: record.id,
    username: record.username,
    isActive: Boolean(record.is_active),
    words
  };
}

export function setUserPassword(userId, newPassword, options = {}) {
  const actor = options.actor || null;
  const resetMethod = options.resetMethod || 'security-phrase';
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

  let passwordHash;
  let passwordSalt;
  try {
    const hashed = hashPassword(newPassword);
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

  updateUserPasswordStatement.run(passwordHash, passwordSalt, numericUserId);
  const updated = getUserById(numericUserId);

  logEvent({
    category: 'benutzer',
    eventType: 'benutzer-passwort-zurueckgesetzt',
    action: 'passwort-zuruecksetzen',
    status: 'erfolgreich',
    entityType: 'benutzer',
    entityId: String(numericUserId),
    entityName: updated?.username ?? existingUser.username ?? `ID ${numericUserId}`,
    message: `Passwort für Benutzer "${updated?.username ?? existingUser.username ?? numericUserId}" zurückgesetzt`,
    metadata: {
      resetMethod
    },
    ...resolveActorFields(actor)
  });

  return updated;
}

export function ensureSecurityPhrasesForExistingUsers() {
  const rows = selectUsersMissingSecurityPhraseStatement.all();
  if (!Array.isArray(rows) || rows.length === 0) {
    return 0;
  }

  let processed = 0;
  const initialize = db.transaction((users) => {
    users.forEach((entry) => {
      if (!entry || entry.id === undefined || entry.id === null) {
        return;
      }
      const words = generateSecurityPhraseWords(8);
      const { encrypted: encryptedPhrase } = encryptSecurityPhrase(words);
      updateSecurityPhraseStatement.run(
        encryptedPhrase.content,
        encryptedPhrase.iv,
        encryptedPhrase.tag,
        entry.id
      );
      processed += 1;
    });
  });

  initialize(rows);
  return processed;
}

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

  const securityPhraseWords = generateSecurityPhraseWords(8);
  const { encrypted: encryptedPhrase } = encryptSecurityPhrase(securityPhraseWords);
  const securityPhrasePayload = {
    content: encryptedPhrase.content,
    iv: encryptedPhrase.iv,
    tag: encryptedPhrase.tag
  };

  const userId = insertUserWithGroups({
    username: normalizedUsername,
    email: normalizedEmail,
    passwordHash,
    passwordSalt,
    avatarColor: avatarColorToPersist,
    groupId: numericGroupId,
    securityPhrase: securityPhrasePayload
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

const sanitizeAssignment = (row) => ({
  userId: row.user_id,
  serverId: row.server_id,
  groupId: row.group_id ?? null,
  groupName: row.group_name || null,
  serverName: row.server_name || null,
  serverUrl: row.server_url || null,
  useGlobalGroup: Boolean(row.use_global_group),
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null
});

export function getUserServerAssignments(userId) {
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
  if (superuserMembership?.has_membership) {
    return [];
  }

  const rows = selectAssignmentsByUser.all(numericUserId);
  return rows.map(sanitizeAssignment);
}

export function setUserServerAssignments(userId, assignments = [], options = {}) {
  const actor = options.actor || null;
  const numericUserId = Number(userId);
  if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
    const error = new Error('INVALID_USER_ID');
    error.code = 'INVALID_USER_ID';
    throw error;
  }

  const userRecord = selectUserCredentialsById.get(numericUserId);
  if (!userRecord) {
    const error = new Error('USER_NOT_FOUND');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  const superuserMembership = isUserInGroupStatement.get(numericUserId, SUPERUSER_GROUP_NAME);
  if (superuserMembership?.has_membership) {
    const error = new Error('USER_SUPERUSER_PROTECTED');
    error.code = 'USER_SUPERUSER_PROTECTED';
    throw error;
  }

  const normalizedList = Array.isArray(assignments) ? assignments : [];
  const missingServers = [];
  const missingGroups = [];
  const normalizedAssignments = new Map();

  normalizedList.forEach((entry) => {
    const rawServerId = entry?.serverId ?? entry?.server_id ?? entry?.id;
    const serverId = Number(rawServerId);
    if (!Number.isFinite(serverId) || serverId <= 0) {
      return;
    }

    const serverRow = selectServerByIdForAssignment.get(serverId);
    if (!serverRow) {
      missingServers.push(serverId);
      return;
    }

    const useGlobalGroup =
      entry?.useGlobalGroup === true ||
      entry?.use_global_group === 1 ||
      entry?.use_global_group === true;

    const rawGroupId = entry?.groupId ?? entry?.group_id;
    const groupId = Number(rawGroupId);
    const normalizedGroupId = Number.isFinite(groupId) && groupId > 0 ? groupId : null;

    if (!useGlobalGroup && normalizedGroupId === null) {
      missingGroups.push(serverId);
      return;
    }

    if (normalizedGroupId !== null) {
      const groupRow = selectGroupById.get(normalizedGroupId);
      if (!groupRow) {
        missingGroups.push(serverId);
        return;
      }
    }

    normalizedAssignments.set(serverId, {
      serverId,
      groupId: normalizedGroupId,
      useGlobalGroup
    });
  });

  if (missingServers.length > 0) {
    const error = new Error('SERVER_NOT_FOUND');
    error.code = 'SERVER_NOT_FOUND';
    error.missingServerIds = missingServers;
    throw error;
  }

  if (missingGroups.length > 0) {
    const error = new Error('GROUP_NOT_FOUND');
    error.code = 'GROUP_NOT_FOUND';
    error.missingServerIds = missingGroups;
    throw error;
  }

  const previousAssignments = selectAssignmentsByUser.all(numericUserId);

  const applyAssignments = db.transaction(() => {
    deleteUserServerAssignments.run(numericUserId);
    Array.from(normalizedAssignments.values()).forEach((assignment) => {
      upsertUserServerAssignment.run(
        numericUserId,
        assignment.serverId,
        assignment.groupId,
        assignment.useGlobalGroup ? 1 : 0
      );
    });
  });

  applyAssignments();

  const updatedAssignments = selectAssignmentsByUser.all(numericUserId);
  const sanitizedUpdated = updatedAssignments.map(sanitizeAssignment);

  logEvent({
    category: 'benutzer',
    eventType: 'benutzer-server-zuordnung-aktualisiert',
    action: 'aktualisieren',
    status: 'erfolgreich',
    entityType: 'benutzer',
    entityId: String(numericUserId),
    entityName: userRecord?.username ?? `ID ${numericUserId}`,
    message: `Serverzuordnungen für Benutzer "${userRecord?.username ?? numericUserId}" aktualisiert`,
    metadata: {
      assignments: sanitizedUpdated.map((entry) => ({
        serverId: entry.serverId,
        serverName: entry.serverName,
        useGlobalGroup: entry.useGlobalGroup,
        groupId: entry.groupId,
        groupName: entry.groupName
      })),
      previousAssignments: previousAssignments.map((entry) => ({
        serverId: entry.server_id,
        serverName: entry.server_name,
        useGlobalGroup: Boolean(entry.use_global_group),
        groupId: entry.group_id,
        groupName: entry.group_name || null
      }))
    },
    ...resolveActorFields(actor)
  });

  return sanitizedUpdated;
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
