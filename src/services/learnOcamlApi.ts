/**
 * Learn OCaml API Client
 * 
 * Communicates with a Learn OCaml server instance through our backend proxy
 * to avoid CORS issues. The proxy forwards requests to the configured
 * Learn OCaml server.
 * 
 * API Reference (from learn-ocaml source code):
 *   GET  /version                              -> { version, server_id }
 *   GET  /exercise-index.json?token=TOKEN      -> [exercise_index, grades]
 *   GET  /exercises/{id}.json?token=TOKEN      -> [meta, exercise, grade]
 *   GET  /save.json?token=TOKEN                -> Save
 *   POST /sync?token=TOKEN   body=Save         -> Save
 */

import type {
  LearnOcamlConnection,
  LearnOcamlExerciseIndexEntry,
  LearnOcamlExercise,
  LearnOcamlGradeResult,
  LearnOcamlSaveState,
  LearnOcamlExerciseGroup,
} from '../types';

const API_BASE = '/api/learn-ocaml';

class LearnOcamlApiClient {
  private connection: LearnOcamlConnection | null = null;

  // ── Connection Management ──────────────────────────────────────────────

  setConnection(conn: LearnOcamlConnection | null) {
    this.connection = conn;
    if (conn) {
      localStorage.setItem('learnOcaml_connection', JSON.stringify(conn));
    } else {
      localStorage.removeItem('learnOcaml_connection');
    }
  }

  getConnection(): LearnOcamlConnection | null {
    if (!this.connection) {
      const stored = localStorage.getItem('learnOcaml_connection');
      if (stored) {
        try {
          this.connection = JSON.parse(stored);
        } catch {
          localStorage.removeItem('learnOcaml_connection');
        }
      }
    }
    return this.connection;
  }

  isConnected(): boolean {
    return !!this.getConnection();
  }

  // ── Generic Request Helper ─────────────────────────────────────────────

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const mainToken = localStorage.getItem('caraml_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (mainToken) {
      headers['Authorization'] = `Bearer ${mainToken}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  }

  // ── API Methods ────────────────────────────────────────────────────────

  /**
   * Test connection to a Learn OCaml server with a given token.
   * Returns server version info.
   */
  async connect(serverUrl: string, token: string): Promise<{ version: string; nickname?: string }> {
    return this.request<{ version: string; nickname?: string }>('/connect', {
      method: 'POST',
      body: JSON.stringify({ serverUrl, token }),
    });
  }

  /**
   * Disconnect from Learn OCaml server.
   */
  disconnect() {
    this.setConnection(null);
  }

  /**
   * Get the exercise index (tree of groups and exercises with grades).
   */
  async getExerciseIndex(): Promise<{
    index: (LearnOcamlExerciseGroup | LearnOcamlExerciseIndexEntry)[];
    grades: Record<string, number>;
  }> {
    const conn = this.getConnection();
    if (!conn) throw new Error('Not connected to Learn OCaml');
    return this.request('/exercises', {
      method: 'POST',
      body: JSON.stringify({ serverUrl: conn.serverUrl, token: conn.token }),
    });
  }

  /**
   * Get a specific exercise with its content, description, and template.
   */
  async getExercise(exerciseId: string): Promise<LearnOcamlExercise> {
    const conn = this.getConnection();
    if (!conn) throw new Error('Not connected to Learn OCaml');
    // Exercise IDs contain slashes (e.g. "tp1/lists") — pass as-is to wildcard route
    return this.request(`/exercise/${exerciseId}`, {
      method: 'POST',
      body: JSON.stringify({ serverUrl: conn.serverUrl, token: conn.token }),
    });
  }

  /**
   * Get the full save state for the user.
   */
  async getSaveState(): Promise<LearnOcamlSaveState> {
    const conn = this.getConnection();
    if (!conn) throw new Error('Not connected to Learn OCaml');
    return this.request('/save', {
      method: 'POST',
      body: JSON.stringify({ serverUrl: conn.serverUrl, token: conn.token }),
    });
  }

  /**
   * Update the user's answer for an exercise.
   * Fetches current save, merges the new answer, and syncs back.
   */
  async updateExerciseAnswer(exerciseId: string, code: string): Promise<void> {
    const conn = this.getConnection();
    if (!conn) throw new Error('Not connected to Learn OCaml');
    return this.request('/sync-answer', {
      method: 'POST',
      body: JSON.stringify({
        serverUrl: conn.serverUrl,
        token: conn.token,
        exerciseId,
        code,
      }),
    });
  }

  /**
   * Grade an exercise: sends the user's code for grading.
   * The grading happens on the Learn OCaml server via the save/sync mechanism.
   */
  async gradeExercise(exerciseId: string, code: string): Promise<LearnOcamlGradeResult> {
    const conn = this.getConnection();
    if (!conn) throw new Error('Not connected to Learn OCaml');
    return this.request('/grade', {
      method: 'POST',
      body: JSON.stringify({
        serverUrl: conn.serverUrl,
        token: conn.token,
        exerciseId,
        code,
      }),
    });
  }
}

export const learnOcamlApi = new LearnOcamlApiClient();
