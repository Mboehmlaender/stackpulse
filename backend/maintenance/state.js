import { getJsonSetting, setJsonSetting } from '../db/settings.js';
import { logEvent } from '../logging/eventLogs.js';

const MAINTENANCE_KEY = 'maintenance_mode';

const DEFAULT_STATE = {
  active: false,
  message: null,
  activatedAt: null,
  updatedAt: null,
  extra: null
};

let maintenanceState = loadState();

function loadState() {
  const saved = getJsonSetting(MAINTENANCE_KEY, null);
  if (!saved) {
    const initial = { ...DEFAULT_STATE, updatedAt: new Date().toISOString() };
    setJsonSetting(MAINTENANCE_KEY, initial);
    return initial;
  }
  return {
    ...DEFAULT_STATE,
    ...saved
  };
}

function persistState(state) {
  maintenanceState = {
    ...DEFAULT_STATE,
    ...state,
    updatedAt: new Date().toISOString()
  };
  setJsonSetting(MAINTENANCE_KEY, maintenanceState);
  return maintenanceState;
}

export function getMaintenanceState() {
  return { ...maintenanceState };
}

export function isMaintenanceModeActive() {
  return Boolean(maintenanceState?.active);
}

export function activateMaintenanceMode({ message = null, extra = null } = {}) {
  logEvent({
    category: 'wartung',
    eventType: 'Wartungsmodus',
    action: 'aktivieren',
    status: 'gestartet',
    entityType: 'system',
    entityId: 'wartung',
    entityName: 'StackPulse Wartung',
    contextType: 'System',
    contextId: 'System',
    message: 'Wartungsmodus aktiviert',
    source: 'system'
  });
  const now = new Date().toISOString();
  return persistState({
    active: true,
    message,
    extra,
    activatedAt: now
  });
}

export function deactivateMaintenanceMode({ message = null } = {}) {
  logEvent({
    category: 'wartung',
    eventType: 'wartungsmodus',
    action: 'deaktivieren',
    status: 'erfolgreich',
    entityType: 'system',
    entityId: 'wartung',
    entityName: 'StackPulse Wartung',
    contextType: 'System',
    contextId: 'System',
    message: 'Wartungsmodus deaktiviert',
    source: 'system'
  });
  return persistState({
    active: false,
    message,
    extra: null,
    activatedAt: null
  });
}
