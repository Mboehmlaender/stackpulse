import { db } from '../db/index.js';

const LEVEL_PRIORITY = {
  none: 0,
  read: 1,
  full: 2
};

const selectSections = db.prepare(`
  SELECT id, key, title, sort_order, has_navigation_flag
  FROM permission_sections
  ORDER BY sort_order ASC, id ASC
`);

const selectGroups = db.prepare(`
  SELECT id, section_id, parent_group_id, key, title, sort_order
  FROM permission_groups
  ORDER BY section_id ASC, sort_order ASC, id ASC
`);

const selectItems = db.prepare(`
  SELECT
    id,
    section_id,
    group_id,
    key,
    label,
    sort_order,
    default_level,
    available_levels,
    is_global_scope,
    is_required
  FROM permission_items
  ORDER BY section_id ASC, COALESCE(group_id, 0) ASC, sort_order ASC, id ASC
`);

const selectDependencies = db.prepare(`
  SELECT permission_id, depends_on_permission_id, required_level
  FROM permission_dependencies
`);

const selectPermissionItemsForMap = db.prepare(`
  SELECT id, key, available_levels, default_level, is_global_scope
  FROM permission_items
`);

const selectGroupPermissionValues = db.prepare(`
  SELECT gp.permission_id, gp.level, gp.effective_level, pi.key
  FROM group_permission_values gp
  JOIN permission_items pi ON pi.id = gp.permission_id
  WHERE gp.group_id = ?
`);

const deleteGroupPermissionValuesStmt = db.prepare(`
  DELETE FROM group_permission_values
  WHERE group_id = ?
`);

const insertGroupPermissionValueStmt = db.prepare(`
  INSERT INTO group_permission_values (group_id, permission_id, level, effective_level, created_at, updated_at)
  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);

const parseAvailableLevels = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) {
    return ['full', 'read', 'none'];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) {
      return parsed;
    }
  } catch (error) {
    console.warn('⚠️ Konnte available_levels nicht parsen:', error.message);
  }
  return ['full', 'read', 'none'];
};

const getLevelPriority = (level) => {
  if (!level) return 0;
  return LEVEL_PRIORITY[level] ?? 0;
};

let cachedPermissionItems = null;
let cachedServerScopedKeys = null;
let cachedScopeByKey = null;

const getPermissionItems = () => {
  if (!cachedPermissionItems) {
    cachedPermissionItems = selectPermissionItemsForMap.all();
  }
  return cachedPermissionItems;
};

const resetPermissionItemsCache = () => {
  cachedPermissionItems = null;
  cachedServerScopedKeys = null;
  cachedScopeByKey = null;
};

const getScopeCache = () => {
  if (!cachedScopeByKey || !cachedServerScopedKeys) {
    const items = getPermissionItems();
    cachedScopeByKey = new Map();
    cachedServerScopedKeys = new Set();
    items.forEach((item) => {
      const isGlobal = item.is_global_scope !== 0;
      cachedScopeByKey.set(item.key, { isGlobal });
      if (!isGlobal) {
        cachedServerScopedKeys.add(item.key);
      }
    });
  }
  return { scopeByKey: cachedScopeByKey, serverScopedKeys: cachedServerScopedKeys };
};

export function getPermissionStructure() {
  const sections = selectSections.all();
  const groups = selectGroups.all();
  const items = selectItems.all();
  const dependencies = selectDependencies.all();

  const itemIdToKey = new Map(items.map((item) => [item.id, item.key]));

  const dependenciesByItemId = new Map();
  dependencies.forEach((dependency) => {
    const list = dependenciesByItemId.get(dependency.permission_id) || [];
    list.push(dependency);
    dependenciesByItemId.set(dependency.permission_id, list);
  });

  const groupsBySectionId = new Map();
  const groupsByParentId = new Map();
  const sortedGroups = [...groups].sort((a, b) => {
    const sortDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (sortDiff !== 0) return sortDiff;
    return a.id - b.id;
  });

  sortedGroups.forEach((group) => {
    if (group.parent_group_id) {
      const list = groupsByParentId.get(group.parent_group_id) || [];
      list.push(group);
      groupsByParentId.set(group.parent_group_id, list);
    } else {
      const list = groupsBySectionId.get(group.section_id) || [];
      list.push(group);
      groupsBySectionId.set(group.section_id, list);
    }
  });

  const itemsBySectionId = new Map();
  const itemsByGroupId = new Map();

  items.forEach((item) => {
    if (item.group_id) {
      const list = itemsByGroupId.get(item.group_id) || [];
      list.push(item);
      itemsByGroupId.set(item.group_id, list);
    } else {
      const list = itemsBySectionId.get(item.section_id) || [];
      list.push(item);
      itemsBySectionId.set(item.section_id, list);
    }
  });

  const formatItem = (item) => {
    const availableLevels = parseAvailableLevels(item.available_levels);

    const dependencyEntries = dependenciesByItemId.get(item.id) || [];
    const formattedDependencies = dependencyEntries
      .map((dependency) => {
        const dependsOnKey = itemIdToKey.get(dependency.depends_on_permission_id);
        if (!dependsOnKey) {
          return null;
        }
        return {
          key: dependsOnKey,
          requiredLevel: dependency.required_level || null
        };
      })
      .filter(Boolean);

    return {
      key: item.key,
      label: item.label,
      sortOrder: item.sort_order ?? 0,
      defaultLevel: item.default_level || 'none',
      availableLevels,
      isRequired: Boolean(item.is_required),
      isGlobal: item.is_global_scope !== 0,
      dependencies: formattedDependencies
    };
  };

  const buildGroupTree = (group) => {
    const children = groupsByParentId.get(group.id) || [];
    return {
      key: group.key,
      title: group.title,
      sortOrder: group.sort_order ?? 0,
      items: (itemsByGroupId.get(group.id) || []).map(formatItem),
      groups: children.map(buildGroupTree)
    };
  };

  const formattedSections = sections.map((section) => {
    const sectionItems = (itemsBySectionId.get(section.id) || []).map(formatItem);
    const rootGroups = groupsBySectionId.get(section.id) || [];
    const sectionGroups = rootGroups.map(buildGroupTree);

    return {
      key: section.key,
      title: section.title,
      sortOrder: section.sort_order ?? 0,
      hasNavigation: Boolean(section.has_navigation_flag),
      items: sectionItems,
      groups: sectionGroups
    };
  });

  return formattedSections;
}

export function getPermissionValuesByGroup(groupId) {
  const numericId = Number(groupId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return {};
  }

  const rows = selectGroupPermissionValues.all(numericId);
  const values = {};
  rows.forEach((row) => {
    if (row?.key && typeof row.level === 'string') {
      values[row.key] = row.level;
    }
  });
  return values;
}

export function clearGroupPermissionValues(groupId) {
  const numericId = Number(groupId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return;
  }
  deleteGroupPermissionValuesStmt.run(numericId);
}

export function saveGroupPermissionValues(groupId, values = {}) {
  const numericId = Number(groupId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    const error = new Error('INVALID_GROUP_ID');
    error.code = 'INVALID_GROUP_ID';
    throw error;
  }

  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    const error = new Error('PERMISSION_INVALID_PAYLOAD');
    error.code = 'PERMISSION_INVALID_PAYLOAD';
    throw error;
  }

  const items = getPermissionItems();
  const itemMap = new Map();
  items.forEach((item) => {
    itemMap.set(item.key, {
      id: item.id,
      key: item.key,
      defaultLevel: item.default_level || 'none',
      availableLevels: parseAvailableLevels(item.available_levels)
    });
  });

  const entries = Object.entries(values);
  const normalizedEntries = [];

  entries.forEach(([key, rawValue]) => {
    const item = itemMap.get(key);
    if (!item) {
      const error = new Error('PERMISSION_UNKNOWN_KEY');
      error.code = 'PERMISSION_UNKNOWN_KEY';
      error.permissionKey = key;
      throw error;
    }

    let level = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue ?? '').trim();
    if (!level) {
      level = 'none';
    }

    if (!item.availableLevels.includes(level)) {
      const error = new Error('PERMISSION_INVALID_LEVEL');
      error.code = 'PERMISSION_INVALID_LEVEL';
      error.permissionKey = key;
      error.level = level;
      throw error;
    }

    normalizedEntries.push({ item, level });
  });

  const getSubmittedLevel = (permissionKey) => {
    const entry = normalizedEntries.find((entry) => entry.item.key === permissionKey);
    if (entry) {
      return entry.level;
    }
    const fallback = itemMap.get(permissionKey);
    return fallback ? fallback.defaultLevel || 'none' : 'none';
  };

  const serverManageLevel = getSubmittedLevel('maintenance-server-manage');
  const serverEditLevel = getSubmittedLevel('maintenance-server-edit');
  const serverDeleteLevel = getSubmittedLevel('maintenance-server-delete');

  // Enforce dependency: "server löschen" darf maximal so hoch sein wie manage/edit.
  const deletePriority = getLevelPriority(serverDeleteLevel);
  const allowedDeletePriority = Math.min(
    getLevelPriority(serverManageLevel),
    getLevelPriority(serverEditLevel)
  );
  if (deletePriority > allowedDeletePriority) {
    const allowedLevelEntry = Object.entries(LEVEL_PRIORITY).find(([, priority]) => priority === allowedDeletePriority);
    const allowedLevel = allowedLevelEntry ? allowedLevelEntry[0] : 'none';
    const deleteEntry = normalizedEntries.find((entry) => entry.item.key === 'maintenance-server-delete');
    if (deleteEntry) {
      deleteEntry.level = allowedLevel;
    } else {
      normalizedEntries.push({
        item: itemMap.get('maintenance-server-delete'),
        level: allowedLevel
      });
    }
  }

  const runSave = db.transaction(() => {
    deleteGroupPermissionValuesStmt.run(numericId);
    normalizedEntries.forEach(({ item, level }) => {
      if (level === (item.defaultLevel || 'none')) {
        return;
      }
      insertGroupPermissionValueStmt.run(numericId, item.id, level, level);
    });
  });

  runSave();
  resetPermissionItemsCache();

  return getPermissionValuesByGroup(numericId);
}

export function getDefaultPermissionMap() {
  const items = getPermissionItems();
  const defaults = {};
  items.forEach((item) => {
    defaults[item.key] = item.default_level || 'none';
  });
  return defaults;
}

export function getSuperuserPermissionMap() {
  const items = getPermissionItems();
  const result = {};

  items.forEach((item) => {
    const available = parseAvailableLevels(item.available_levels);
    let chosen = 'full';
    if (!available.includes('full')) {
      chosen = available.reduce(
        (best, candidate) =>
          getLevelPriority(candidate) > getLevelPriority(best) ? candidate : best,
        'none'
      );
    }
    result[item.key] = chosen;
  });

  return result;
}

export function getServerScopedPermissionKeys() {
  const { serverScopedKeys } = getScopeCache();
  return Array.from(serverScopedKeys);
}

export function isServerScopedPermission(permissionKey) {
  if (!permissionKey) return false;
  const { serverScopedKeys, scopeByKey } = getScopeCache();
  if (serverScopedKeys.has(permissionKey)) {
    return true;
  }
  const scope = scopeByKey.get(permissionKey);
  return scope ? scope.isGlobal === false : false;
}

export function applyServerScopedOverride(basePermissions = {}, overridePermissions = {}) {
  const merged = { ...basePermissions };
  const { serverScopedKeys } = getScopeCache();
  serverScopedKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(overridePermissions, key)) {
      merged[key] = overridePermissions[key];
    }
  });
  return merged;
}

export function getEffectivePermissionsForGroup(groupId) {
  const defaults = getDefaultPermissionMap();
  const numericId = Number(groupId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return defaults;
  }

  const overrides = getPermissionValuesByGroup(numericId);
  const map = { ...defaults };

  Object.keys(overrides).forEach((key) => {
    const value = overrides[key];
    if (typeof value === 'string') {
      map[key] = value;
    }
  });

  return map;
}

export function getEffectivePermissionsForGroups(groupIds = []) {
  const defaults = getDefaultPermissionMap();
  const finalMap = { ...defaults };

  const iterableIds = Array.isArray(groupIds) ? groupIds : [];
  iterableIds
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .forEach((groupId) => {
      const map = getEffectivePermissionsForGroup(groupId);
      Object.entries(map).forEach(([key, level]) => {
        if (getLevelPriority(level) > getLevelPriority(finalMap[key] ?? 'none')) {
          finalMap[key] = level;
        }
      });
    });

  return finalMap;
}

export function hasRequiredPermission(permissions = {}, permissionKey, requiredLevel = 'full') {
  if (!permissionKey) {
    return true;
  }
  if (requiredLevel === 'none' || requiredLevel === null || requiredLevel === undefined) {
    return true;
  }
  const current = typeof permissions[permissionKey] === 'string' ? permissions[permissionKey] : 'none';
  const required = typeof requiredLevel === 'string' ? requiredLevel : 'full';
  return getLevelPriority(current) >= getLevelPriority(required);
}
