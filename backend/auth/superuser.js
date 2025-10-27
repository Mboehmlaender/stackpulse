import crypto from 'crypto';
import { db } from '../db/index.js';

export const SUPERUSER_GROUP_NAME = 'superuser';

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
  INSERT INTO users (username, email, password_hash, password_salt, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);

const updateUser = db.prepare(`
  UPDATE users
  SET username = ?, email = ?, password_hash = ?, password_salt = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
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

const creationTransaction = db.transaction(({ username, email, passwordHash, passwordSalt, groupId }) => {
  const existingUser = selectUserByUsername.get(username) || selectUserByEmail.get(email);

  let userId;
  if (existingUser) {
    updateUser.run(username, email, passwordHash, passwordSalt, existingUser.id);
    userId = existingUser.id;
  } else {
    const result = insertUser.run(username, email, passwordHash, passwordSalt);
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

  const user = creationTransaction({
    username: normalizedUsername,
    email: normalizedEmail,
    passwordHash: hash,
    passwordSalt: salt,
    groupId: group.id
  });

  return {
    id: user.id,
    username: user.username,
    email: user.email
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
