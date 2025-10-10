import { getJsonSetting, setJsonSetting } from '../db/settings.js';

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
  const now = new Date().toISOString();
  return persistState({
    active: true,
    message,
    extra,
    activatedAt: now
  });
}

export function updateMaintenanceState(partial = {}) {
  return persistState({
    ...maintenanceState,
    ...partial
  });
}

export function deactivateMaintenanceMode({ message = null } = {}) {
  return persistState({
    active: false,
    message,
    extra: null,
    activatedAt: null
  });
}
