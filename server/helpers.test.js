import { describe, expect, it } from 'vitest';
import {
  mergeUiPrefs,
  parseUiPrefs,
  sanitizePanelWidths,
  serializeUser,
} from './helpers.js';

describe('server preference helpers', () => {
  it('parses valid preferences and rejects malformed JSON', () => {
    expect(parseUiPrefs('{"theme":"dark"}')).toEqual({ theme: 'dark' });
    expect(parseUiPrefs('{broken')).toEqual({});
  });

  it('clamps panel widths to supported limits', () => {
    expect(sanitizePanelWidths({ fileTree: 20, memory: 5000 })).toEqual({
      fileTree: 180,
      memory: 760,
    });
  });

  it('preserves unrelated preferences when merging updates', () => {
    expect(
      mergeUiPrefs(
        { theme: 'dark', panelWidths: { fileTree: 220 } },
        { panelWidths: { memory: 440 } }
      )
    ).toEqual({
      theme: 'dark',
      panelWidths: { fileTree: 220, memory: 440 },
    });
  });

  it('serializes public user fields and parsed preferences', () => {
    const serialized = serializeUser({
      id: 'u1',
      username: 'camel',
      email: 'camel@example.com',
      avatar_color: '#fff',
      created_at: '2026-01-01',
      ui_prefs: '{"panelWidths":{"fileTree":240}}',
      password_hash: 'must-not-leak',
    });
    expect(serialized).not.toHaveProperty('password_hash');
    expect(serialized.ui_prefs).toEqual({ panelWidths: { fileTree: 240 } });
  });
});
