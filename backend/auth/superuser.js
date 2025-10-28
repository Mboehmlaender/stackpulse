import crypto from 'crypto';
import { db } from '../db/index.js';

export const SUPERUSER_GROUP_NAME = 'superuser';

const AVATAR_COLORS = [
  'bg-arcticBlue-600',
  'bg-copperRust-500',
  'bg-sunsetCoral-600',
  'bg-mintTea-400',
  'bg-lavenderSmoke-500',
  'bg-emeraldMist-500',
  'bg-roseQuartz-500',
  'bg-auroraTeal-500',
  'bg-citrusPunch-500',
  'bg-mossGreen-400'
];

const DEFAULT_AVATAR_COLOR = 'bg-mossGreen-500';
const AVATAR_COLOR_SET = new Set([...AVATAR_COLORS, DEFAULT_AVATAR_COLOR]);

const pickRandomAvatarColor = () => {
  if (!Array.isArray(AVATAR_COLORS) || AVATAR_COLORS.length === 0) {
    return DEFAULT_AVATAR_COLOR;
  }
  const index = Math.floor(Math.random() * AVATAR_COLORS.length);
  return AVATAR_COLORS[index] ?? DEFAULT_AVATAR_COLOR;
};

const normalizeAvatarColor = (value) => {
  if (!value) return null;
  const candidate = String(value).trim();
  return AVATAR_COLOR_SET.has(candidate) ? candidate : null;
};

const selectGroupByName = db.prepare('SELECT * FROM user_groups WHERE name = ?');
const insertGroup = db.prepare('INSERT INTO user_groups (name, description) VALUES (?, ?)');

const selectSuperuser = db.prepare(`
  SELECT u.*
  FROM users u
  INNER JOIN user_group_memberships m ON m.user_id = u.id
  INNER JOIN user_groups g ON g.id = m.group_id
  WHERE g.name = ?
  LIMIT 1
`);

const selectUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const selectUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const selectUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const updateLastLogin = db.prepare(`
  UPDATE users
  SET last_login = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const insertUser = db.prepare(`
  INSERT INTO users (username, email, password_hash, password_salt, avatar_color, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);

const updateUser = db.prepare(`
  UPDATE users
  SET username = ?, email = ?, password_hash = ?, password_salt = ?, is_active = 1, avatar_color = COALESCE(?, avatar_color), updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const insertMembership = db.prepare(`
  INSERT OR IGNORE INTO user_group_memberships (user_id, group_id)
  VALUES (?, ?)
`);

const removeMembershipsForGroup = db.prepare(`
  DELETE FROM user_group_memberships
  WHERE group_id = ?
`);

const selectUserIdsForGroup = db.prepare(`
  SELECT u.id
  FROM users u
  INNER JOIN user_group_memberships m ON m.user_id = u.id
  WHERE m.group_id = ?
`);

const deleteUserById = db.prepare('DELETE FROM users WHERE id = ?');
const deleteGroupById = db.prepare('DELETE FROM user_groups WHERE id = ?');

const countSuperusers = db.prepare(`
  SELECT COUNT(*) as count
  FROM user_group_memberships m
  INNER JOIN user_groups g ON g.id = m.group_id
  WHERE g.name = ?
`);

const creationTransaction = db.transaction(({ username, email, passwordHash, passwordSalt, groupId, avatarColor }) => {
  const existingUser = selectUserByUsername.get(username) || selectUserByEmail.get(email);

  let userId;
  if (existingUser) {
    const existingColor = normalizeAvatarColor(existingUser.avatar_color);
    const normalizedNewColor = normalizeAvatarColor(avatarColor);
    const colorToPersist = existingColor || normalizedNewColor || DEFAULT_AVATAR_COLOR;
    updateUser.run(username, email, passwordHash, passwordSalt, colorToPersist, existingUser.id);
    userId = existingUser.id;
  } else {
    const colorToPersist = normalizeAvatarColor(avatarColor) || DEFAULT_AVATAR_COLOR;
    const result = insertUser.run(username, email, passwordHash, passwordSalt, colorToPersist);
    userId = result.lastInsertRowid;
  }

  removeMembershipsForGroup.run(groupId);
  insertMembership.run(userId, groupId);

  return selectUserById.get(userId);
});

export function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    const err = new Error('INVALID_PASSWORD');
    err.code = 'INVALID_PASSWORD';
    throw err;
  }
  const trimmed = password.trim();
  if (!trimmed) {
    const err = new Error('INVALID_PASSWORD');
    err.code = 'INVALID_PASSWORD';
    throw err;
  }
  if (trimmed.length < 8) {
    const err = new Error('PASSWORD_TOO_SHORT');
    err.code = 'PASSWORD_TOO_SHORT';
    throw err;
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(trimmed, salt, 120000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, hash, salt) {
  if (!hash || !salt) return false;
  if (!password || typeof password !== 'string') return false;
  const trimmed = password.trim();
  if (!trimmed) return false;

  const derived = crypto.pbkdf2Sync(trimmed, salt, 120000, 64, 'sha512').toString('hex');
  const storedBuffer = Buffer.from(hash, 'hex');
  const derivedBuffer = Buffer.from(derived, 'hex');
  if (storedBuffer.length !== derivedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(storedBuffer, derivedBuffer);
}

function ensureGroup(name, description = null) {
  let group = selectGroupByName.get(name);
  if (group) return group;
  insertGroup.run(name, description);
  group = selectGroupByName.get(name);
  return group;
}

export function hasSuperuser() {
  const { count } = countSuperusers.get(SUPERUSER_GROUP_NAME);
  return count > 0;
}

export function findUserByIdentifier(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;
  if (value.includes('@')) {
    return selectUserByEmail.get(value.toLowerCase());
  }
  return selectUserByUsername.get(value);
}

export function findUserById(id) {
  if (!id) return null;
  return selectUserById.get(id);
}

export function markUserLogin(userId) {
  if (!userId) return;
  updateLastLogin.run(userId);
}

function createOrUpdateSuperuser({ username, email, password }) {
  const normalizedUsername = String(username || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedUsername) {
    throw new Error('USERNAME_REQUIRED');
  }

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('EMAIL_INVALID');
  }

  const { hash, salt } = hashPassword(password);
  const group = ensureGroup(SUPERUSER_GROUP_NAME, 'System Superuser');
  const avatarColor = pickRandomAvatarColor();

  const user = creationTransaction({
    username: normalizedUsername,
    email: normalizedEmail,
    passwordHash: hash,
    passwordSalt: salt,
    groupId: group.id,
    avatarColor
  });

  const persistedColor = normalizeAvatarColor(user.avatar_color) || avatarColor || DEFAULT_AVATAR_COLOR;

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarColor: persistedColor
  };
}

const deletionTransaction = db.transaction((groupId) => {
  const members = selectUserIdsForGroup.all(groupId);

  members.forEach(({ id }) => {
    deleteUserById.run(id);
  });

  const { changes: groupChanges } = deleteGroupById.run(groupId);

  return {
    usersRemoved: members.length,
    groupRemoved: groupChanges > 0
  };
});

export function ensureSuperuserFromEnv() {
  const username = process.env.SUPERUSER_USERNAME;
  const email = process.env.SUPERUSER_EMAIL;
  const password = process.env.SUPERUSER_PASSWORD;

  if (hasSuperuser()) {
    if (username || email || password) {
      console.log('ℹ️ Superuser existiert bereits - Umgebungsvariablen werden ignoriert.');
    }
    return false;
  }

  if (!username || !email || !password) {
    return false;
  }

  try {
    createOrUpdateSuperuser({ username, email, password });
    console.log('✅ Superuser aus Umgebungsvariablen angelegt.');
    return true;
  } catch (error) {
    console.error('⚠️ Superuser konnte nicht aus Umgebungsvariablen erzeugt werden:', error.message);
    return false;
  }
}

export function registerSuperuser({ username, email, password }) {
  if (hasSuperuser()) {
    const err = new Error('SUPERUSER_ALREADY_EXISTS');
    err.code = 'SUPERUSER_ALREADY_EXISTS';
    throw err;
  }

  try {
    return createOrUpdateSuperuser({ username, email, password });
  } catch (error) {
    if (error.message === 'USERNAME_REQUIRED' || error.message === 'EMAIL_INVALID' || error.message === 'PASSWORD_TOO_SHORT') {
      error.code = error.message;
    }
    throw error;
  }
}

export function removeSuperuser() {
  const group = selectGroupByName.get(SUPERUSER_GROUP_NAME);

  if (!group) {
    const error = new Error('SUPERUSER_NOT_FOUND');
    error.code = 'SUPERUSER_NOT_FOUND';
    throw error;
  }

  return deletionTransaction(group.id);
}

export function getSuperuserSummary() {
  const user = selectSuperuser.get(SUPERUSER_GROUP_NAME);
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email
  };
}
