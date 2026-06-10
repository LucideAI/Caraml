const PANEL_WIDTH_LIMITS = {
  fileTree: { min: 180, max: 420 },
  memory: { min: 300, max: 760 },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseUiPrefs(rawPrefs) {
  if (!rawPrefs) return {};
  try {
    const parsed = JSON.parse(rawPrefs);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizePanelWidths(panelWidths) {
  const next = {};
  if (!panelWidths || typeof panelWidths !== 'object') return next;

  if (Number.isFinite(panelWidths.fileTree)) {
    next.fileTree = Math.round(
      clamp(panelWidths.fileTree, PANEL_WIDTH_LIMITS.fileTree.min, PANEL_WIDTH_LIMITS.fileTree.max)
    );
  }
  if (Number.isFinite(panelWidths.memory)) {
    next.memory = Math.round(
      clamp(panelWidths.memory, PANEL_WIDTH_LIMITS.memory.min, PANEL_WIDTH_LIMITS.memory.max)
    );
  }

  return next;
}

function mergeUiPrefs(existingPrefs, incomingPrefs) {
  const current = existingPrefs && typeof existingPrefs === 'object' ? existingPrefs : {};
  const incoming = incomingPrefs && typeof incomingPrefs === 'object' ? incomingPrefs : {};
  const merged = { ...current };

  if (incoming.panelWidths !== undefined) {
    merged.panelWidths = {
      ...(current.panelWidths && typeof current.panelWidths === 'object' ? current.panelWidths : {}),
      ...sanitizePanelWidths(incoming.panelWidths),
    };
  }

  return merged;
}

function serializeUser(userRow) {
  return {
    id: userRow.id,
    username: userRow.username,
    email: userRow.email,
    avatar_color: userRow.avatar_color,
    created_at: userRow.created_at,
    ui_prefs: parseUiPrefs(userRow.ui_prefs),
  };
}

export { PANEL_WIDTH_LIMITS, clamp, parseUiPrefs, sanitizePanelWidths, mergeUiPrefs, serializeUser };
