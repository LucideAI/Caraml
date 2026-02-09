// ── User Types ──────────────────────────────────────────────────────────────
export interface User {
  id: string;
  username: string;
  email: string;
  avatar_color: string;
  ui_prefs?: UserUiPreferences;
  created_at?: string;
}

export interface UserUiPreferences {
  panelWidths?: {
    fileTree?: number;
    memory?: number;
  };
}

// ── Project Types ───────────────────────────────────────────────────────────
export interface ProjectFile {
  content: string;
  language: string;
}

export interface ProjectFiles {
  [filename: string]: ProjectFile;
}

export interface Project {
  id: string;
  user_id?: string;
  name: string;
  description: string;
  files: ProjectFiles;
  share_id?: string;
  is_public?: number;
  last_opened_file?: string;
  author_name?: string;
  is_owner?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectListItem {
  id: string;
  name: string;
  description: string;
  is_public: number;
  share_id?: string;
  last_opened_file?: string;
  created_at: string;
  updated_at: string;
}

// ── Interpreter Types ───────────────────────────────────────────────────────
export interface StackFrame {
  name: string;
  variables: VariableInfo[];
  line?: number;
}

export interface VariableInfo {
  name: string;
  value: string;
  type: string;
}

export interface HeapObject {
  id: number;
  type: string;
  value: string;
  refCount: number;
}

export interface MemoryState {
  stack: StackFrame[];
  heap: HeapObject[];
  environment: VariableInfo[];
  typeDefinitions: { name: string; definition: string }[];
}

export interface ExecutionResult {
  output: string;
  values: { name: string; type: string; value: string }[];
  errors: { line: number; column: number; message: string }[];
  memoryState: MemoryState;
  executionTimeMs: number;
}

// ── UI Types ────────────────────────────────────────────────────────────────
export type PanelLayout = 'default' | 'editor-only' | 'split-horizontal' | 'split-vertical';
export type Theme = 'dark' | 'light';

export interface EditorTab {
  filename: string;
  isModified: boolean;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

// ── Learn OCaml Types ────────────────────────────────────────────────────────
export interface LearnOcamlConnection {
  serverUrl: string;
  token: string;
  nickname?: string;
  serverVersion?: string;
}

export interface LearnOcamlExerciseMeta {
  id: string;
  title: string;
  short_description?: string;
  stars?: number;  // difficulty 0-4
  kind?: string;
  author?: string;
}

export interface LearnOcamlExerciseIndex {
  groups: LearnOcamlExerciseGroup[];
  exercises: LearnOcamlExerciseIndexEntry[];
}

export interface LearnOcamlExerciseGroup {
  title: string;
  children: (LearnOcamlExerciseGroup | LearnOcamlExerciseIndexEntry)[];
}

export interface LearnOcamlExerciseIndexEntry {
  id: string;
  title: string;
  short_description?: string;
  stars?: number;
  kind?: string;
  grade?: number | null;  // 0-100 or null if not attempted
}

export interface LearnOcamlExercise {
  id: string;
  title: string;
  description: string;  // HTML description
  prelude: string;       // prelude.ml content
  template: string;      // template.ml (starting code)
  solution?: string;
  test?: string;         // test.ml (grading code)
  max_score?: number;
}

export interface LearnOcamlGradeResult {
  grade: number | null; // 0-100 or null if grading unavailable
  max_grade: number;    // typically 100
  report: LearnOcamlReportItem[];
  message?: string;     // informational message (e.g. grading unavailable)
}

export interface LearnOcamlReportItem {
  section: string;
  status: 'success' | 'failure' | 'warning' | 'info';
  message: string;
  details?: string;
  points?: number;
}

export interface LearnOcamlSaveState {
  nickname?: string;
  all_exercise_states: Record<string, LearnOcamlExerciseState>;
  all_exercise_toplevel_histories?: Record<string, any>;
  all_toplevel_histories?: Record<string, any>;
}

export interface LearnOcamlExerciseState {
  solution: string;
  grade?: number | null;
  report?: any;
  mtime?: number;
}
