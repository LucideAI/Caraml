const API_BASE = '/api';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('caraml_token', token);
    } else {
      localStorage.removeItem('caraml_token');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('caraml_token');
    }
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
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

  // ── Auth ────────────────────────────────────────────────────────────────
  async register(username: string, email: string, password: string) {
    return this.request<{ token: string; user: any }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
  }

  async login(login: string, password: string) {
    return this.request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    });
  }

  async getMe() {
    return this.request<{ user: any }>('/auth/me');
  }

  async updatePreferences(data: { panelWidths?: { fileTree?: number; memory?: number } }) {
    return this.request<{ user: any }>('/auth/preferences', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ── Projects ────────────────────────────────────────────────────────────
  async listProjects() {
    return this.request<{ projects: any[] }>('/projects');
  }

  async createProject(name: string, description?: string, template?: string) {
    return this.request<{ project: any }>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description, template }),
    });
  }

  async getProject(id: string) {
    return this.request<{ project: any }>(`/projects/${id}`);
  }

  async updateProject(id: string, data: any) {
    return this.request<{ project: any }>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string) {
    return this.request<{ success: boolean }>(`/projects/${id}`, {
      method: 'DELETE',
    });
  }

  // ── Sharing ─────────────────────────────────────────────────────────────
  async shareProject(id: string) {
    return this.request<{ share_id: string; url: string }>(`/projects/${id}/share`, {
      method: 'POST',
    });
  }

  async unshareProject(id: string) {
    return this.request<{ success: boolean }>(`/projects/${id}/unshare`, {
      method: 'POST',
    });
  }

  async getSharedProject(shareId: string) {
    return this.request<{ project: any }>(`/shared/${shareId}`);
  }

  async forkProject(shareId: string) {
    return this.request<{ project: any }>(`/shared/${shareId}/fork`, {
      method: 'POST',
    });
  }

  // ── OCaml Tooling ─────────────────────────────────────────────────────
  async getCapabilities() {
    return this.request<{ ocaml: boolean; ocamlVersion: string | null; merlin: boolean; ocamlformat: boolean }>('/capabilities');
  }

  async executeCode(code: string) {
    return this.request<{
      backend: boolean;
      stdout?: string;
      stderr?: string;
      exitCode?: number;
      errors?: any[];
      executionTimeMs?: number;
      message?: string;
    }>('/execute', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async runToplevel(code: string, signal?: AbortSignal) {
    return this.request<{
      backend: boolean;
      output?: string;
      rawOutput?: string;
      values?: { name: string; type: string; value: string }[];
      errors?: any[];
      exitCode?: number;
      executionTimeMs?: number;
    }>('/toplevel', {
      method: 'POST',
      body: JSON.stringify({ code }),
      signal,
    });
  }

  async formatCode(code: string) {
    return this.request<{ formatted: string }>('/format', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async merlinComplete(code: string, position: { line: number; column: number }, prefix: string) {
    return this.request<{
      backend: boolean;
      completions: { label: string; kind: string; detail: string; documentation?: string }[];
    }>('/merlin/complete', {
      method: 'POST',
      body: JSON.stringify({ code, position, prefix }),
    });
  }

  async merlinType(code: string, position: { line: number; column: number }) {
    return this.request<{ backend: boolean; type: string | null }>('/merlin/type', {
      method: 'POST',
      body: JSON.stringify({ code, position }),
    });
  }

  async merlinErrors(code: string) {
    return this.request<{
      backend: boolean;
      errors: { line: number; column: number; endLine: number; endColumn: number; message: string; severity: string }[];
    }>('/merlin/errors', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }
}

export const api = new ApiClient();
