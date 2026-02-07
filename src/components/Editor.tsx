import { useRef, useEffect, useCallback } from 'react';
import MonacoEditor, { OnMount, BeforeMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useStore } from '../store';
import { api } from '../services/api';

interface EditorProps {
  onRun?: () => void;
}

// OCaml language definition for Monaco (exported for reuse in Learn OCaml editor)
export const ocamlLanguageDef: any = {
  defaultToken: '',
  tokenPostfix: '.ocaml',

  keywords: [
    'and', 'as', 'assert', 'asr', 'begin', 'class', 'constraint', 'do', 'done',
    'downto', 'else', 'end', 'exception', 'external', 'false', 'for', 'fun',
    'function', 'functor', 'if', 'in', 'include', 'inherit', 'initializer',
    'land', 'lazy', 'let', 'lor', 'lsl', 'lsr', 'lxor', 'match', 'method',
    'mod', 'module', 'mutable', 'new', 'nonrec', 'object', 'of', 'open', 'or',
    'private', 'rec', 'ref', 'sig', 'struct', 'then', 'to', 'true', 'try',
    'type', 'val', 'virtual', 'when', 'while', 'with', 'raise', 'not',
  ],

  typeKeywords: [
    'int', 'float', 'string', 'char', 'bool', 'unit', 'list', 'array',
    'option', 'ref', 'exn', 'format',
  ],

  operators: [
    '=', '>', '<', '!', '~', '?', ':',
    '==', '<=', '>=', '!=', '&&', '||', '++', '--',
    '+', '-', '*', '/', '&', '|', '^', '%',
    '<<', '>>', '>>>', '+=', '-=', '*=', '/=', '&=', '|=',
    '^=', '%=', '<<=', '>>=', '>>>=', '->', '=>', '|>',
    '::', '@', ':=',
  ],

  symbols: /[=><!~?:&|+\-*\/\^%@]+/,

  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

  tokenizer: {
    root: [
      // Comments
      [/\(\*/, 'comment', '@comment'],

      // Strings
      [/"/, 'string', '@string'],

      // Characters
      [/'[^\\']'/, 'string.char'],
      [/'\\.'/, 'string.char'],

      // Type variables
      [/'[a-z_]\w*/, 'type.identifier'],

      // Identifiers and keywords
      [/[A-Z][\w']*/, 'type.identifier'],
      [/[a-z_][\w']*/, {
        cases: {
          '@keywords': 'keyword',
          '@typeKeywords': 'type',
          '@default': 'identifier'
        }
      }],

      // Numbers
      [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/0[oO][0-7]+/, 'number.octal'],
      [/0[bB][01]+/, 'number.binary'],
      [/\d+/, 'number'],

      // Delimiters
      [/[{}()\[\]]/, '@brackets'],
      [/[<>](?!@symbols)/, '@brackets'],
      [/@symbols/, {
        cases: {
          '@operators': 'operator',
          '@default': ''
        }
      }],

      // Delimiter
      [/[;,.]/, 'delimiter'],

      // Whitespace
      { include: '@whitespace' },
    ],

    comment: [
      [/[^\(\*]+/, 'comment'],
      [/\(\*/, 'comment', '@push'],
      [/\*\)/, 'comment', '@pop'],
      [/./, 'comment'],
    ],

    string: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, 'string', '@pop'],
    ],

    whitespace: [
      [/[ \t\r\n]+/, 'white'],
    ],
  },
};

// OCaml auto-completion items (exported for reuse in Learn OCaml editor)
export const ocamlCompletions = [
  // Keywords
  { label: 'let', kind: 'Keyword', insertText: 'let ${1:name} = ${2:value}', insertTextRules: 4, detail: 'Variable binding' },
  { label: 'let rec', kind: 'Keyword', insertText: 'let rec ${1:name} ${2:params} =\n    ${3:body}', insertTextRules: 4, detail: 'Recursive function' },
  { label: 'if', kind: 'Keyword', insertText: 'if ${1:condition} then\n    ${2:then_expr}\nelse\n    ${3:else_expr}', insertTextRules: 4, detail: 'Conditional' },
  { label: 'match', kind: 'Keyword', insertText: 'match ${1:expr} with\n| ${2:pattern} -> ${3:body}', insertTextRules: 4, detail: 'Pattern matching' },
  { label: 'fun', kind: 'Keyword', insertText: 'fun ${1:x} -> ${2:body}', insertTextRules: 4, detail: 'Anonymous function' },
  { label: 'function', kind: 'Keyword', insertText: 'function\n| ${1:pattern} -> ${2:body}', insertTextRules: 4, detail: 'Pattern matching function' },
  { label: 'type', kind: 'Keyword', insertText: 'type ${1:name} =\n    | ${2:Constructor}', insertTextRules: 4, detail: 'Type declaration' },
  { label: 'begin', kind: 'Keyword', insertText: 'begin\n    ${1:body}\nend', insertTextRules: 4, detail: 'Block expression' },
  { label: 'try', kind: 'Keyword', insertText: 'try\n    ${1:expr}\nwith\n| ${2:pattern} -> ${3:handler}', insertTextRules: 4, detail: 'Exception handling' },
  { label: 'for', kind: 'Keyword', insertText: 'for ${1:i} = ${2:0} to ${3:n} do\n    ${4:body}\ndone', insertTextRules: 4, detail: 'For loop' },
  { label: 'while', kind: 'Keyword', insertText: 'while ${1:condition} do\n    ${2:body}\ndone', insertTextRules: 4, detail: 'While loop' },
  { label: 'exception', kind: 'Keyword', insertText: 'exception ${1:Name} of ${2:type}', insertTextRules: 4, detail: 'Exception declaration' },

  // Common functions
  { label: 'print_endline', kind: 'Function', insertText: 'print_endline "${1:text}"', insertTextRules: 4, detail: 'string -> unit' },
  { label: 'print_string', kind: 'Function', insertText: 'print_string "${1:text}"', insertTextRules: 4, detail: 'string -> unit' },
  { label: 'print_int', kind: 'Function', insertText: 'print_int ${1:n}', insertTextRules: 4, detail: 'int -> unit' },
  { label: 'print_float', kind: 'Function', insertText: 'print_float ${1:x}', insertTextRules: 4, detail: 'float -> unit' },
  { label: 'print_newline', kind: 'Function', insertText: 'print_newline ()', insertTextRules: 4, detail: 'unit -> unit' },
  { label: 'Printf.printf', kind: 'Function', insertText: 'Printf.printf "${1:format}" ${2:args}', insertTextRules: 4, detail: 'Formatted output' },
  { label: 'string_of_int', kind: 'Function', insertText: 'string_of_int ${1:n}', insertTextRules: 4, detail: 'int -> string' },
  { label: 'int_of_string', kind: 'Function', insertText: 'int_of_string ${1:s}', insertTextRules: 4, detail: 'string -> int' },
  { label: 'float_of_int', kind: 'Function', insertText: 'float_of_int ${1:n}', insertTextRules: 4, detail: 'int -> float' },
  { label: 'failwith', kind: 'Function', insertText: 'failwith "${1:message}"', insertTextRules: 4, detail: 'string -> \'a' },

  // List module
  { label: 'List.map', kind: 'Function', insertText: 'List.map (fun ${1:x} -> ${2:body}) ${3:list}', insertTextRules: 4, detail: "('a -> 'b) -> 'a list -> 'b list" },
  { label: 'List.filter', kind: 'Function', insertText: 'List.filter (fun ${1:x} -> ${2:condition}) ${3:list}', insertTextRules: 4, detail: "('a -> bool) -> 'a list -> 'a list" },
  { label: 'List.fold_left', kind: 'Function', insertText: 'List.fold_left (fun ${1:acc} ${2:x} -> ${3:body}) ${4:init} ${5:list}', insertTextRules: 4, detail: "('a -> 'b -> 'a) -> 'a -> 'b list -> 'a" },
  { label: 'List.iter', kind: 'Function', insertText: 'List.iter (fun ${1:x} -> ${2:body}) ${3:list}', insertTextRules: 4, detail: "('a -> unit) -> 'a list -> unit" },
  { label: 'List.length', kind: 'Function', insertText: 'List.length ${1:list}', insertTextRules: 4, detail: "'a list -> int" },
  { label: 'List.rev', kind: 'Function', insertText: 'List.rev ${1:list}', insertTextRules: 4, detail: "'a list -> 'a list" },
  { label: 'List.hd', kind: 'Function', insertText: 'List.hd ${1:list}', insertTextRules: 4, detail: "'a list -> 'a" },
  { label: 'List.tl', kind: 'Function', insertText: 'List.tl ${1:list}', insertTextRules: 4, detail: "'a list -> 'a list" },
  { label: 'List.nth', kind: 'Function', insertText: 'List.nth ${1:list} ${2:n}', insertTextRules: 4, detail: "'a list -> int -> 'a" },
  { label: 'List.sort', kind: 'Function', insertText: 'List.sort compare ${1:list}', insertTextRules: 4, detail: "('a -> 'a -> int) -> 'a list -> 'a list" },
  { label: 'List.mem', kind: 'Function', insertText: 'List.mem ${1:elem} ${2:list}', insertTextRules: 4, detail: "'a -> 'a list -> bool" },
  { label: 'List.init', kind: 'Function', insertText: 'List.init ${1:n} (fun ${2:i} -> ${3:body})', insertTextRules: 4, detail: "int -> (int -> 'a) -> 'a list" },

  // String module
  { label: 'String.length', kind: 'Function', insertText: 'String.length ${1:s}', insertTextRules: 4, detail: 'string -> int' },
  { label: 'String.sub', kind: 'Function', insertText: 'String.sub ${1:s} ${2:pos} ${3:len}', insertTextRules: 4, detail: 'string -> int -> int -> string' },
  { label: 'String.concat', kind: 'Function', insertText: 'String.concat "${1:sep}" ${2:list}', insertTextRules: 4, detail: 'string -> string list -> string' },

  // Array module
  { label: 'Array.make', kind: 'Function', insertText: 'Array.make ${1:n} ${2:init}', insertTextRules: 4, detail: "int -> 'a -> 'a array" },
  { label: 'Array.init', kind: 'Function', insertText: 'Array.init ${1:n} (fun ${2:i} -> ${3:body})', insertTextRules: 4, detail: "int -> (int -> 'a) -> 'a array" },
  { label: 'Array.length', kind: 'Function', insertText: 'Array.length ${1:arr}', insertTextRules: 4, detail: "'a array -> int" },

  // Snippets
  { label: 'module', kind: 'Snippet', insertText: 'module ${1:Name} = struct\n    ${2:body}\nend', insertTextRules: 4, detail: 'Module declaration' },
  { label: 'sig', kind: 'Snippet', insertText: 'sig\n    ${1:body}\nend', insertTextRules: 4, detail: 'Module signature' },
];

/**
 * Register OCaml language, theme, and completions with Monaco.
 * Exported so it can be reused by the Learn OCaml exercise editor.
 */
export function registerOcamlLanguage(monaco: any) {
  // Only register once
  const existingLangs = monaco.languages.getLanguages();
  if (existingLangs.some((l: any) => l.id === 'ocaml')) return;

  monaco.languages.register({ id: 'ocaml' });
  monaco.languages.setMonarchTokensProvider('ocaml', ocamlLanguageDef);

  monaco.languages.setLanguageConfiguration('ocaml', {
    comments: { blockComment: ['(*', '*)'] },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
      ['begin', 'end'],
      ['struct', 'end'],
      ['sig', 'end'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '(*', close: '*)' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
    ],
    indentationRules: {
      increaseIndentPattern: /^\s*(let|in|if|then|else|begin|struct|sig|match|try|fun|function|for|while|do|type|module|with|object|method)\b.*$/,
      decreaseIndentPattern: /^\s*(end|done|in|\|)\b/,
    },
    folding: {
      markers: {
        start: /^\s*\(\*/,
        end: /\*\)\s*$/,
      },
    },
  });

  // Register completion provider
  monaco.languages.registerCompletionItemProvider('ocaml', {
    provideCompletionItems: async (model: any, position: any) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const lineContent = model.getLineContent(position.lineNumber);
      const textUntilPosition = lineContent.substring(0, position.column - 1);
      const moduleMatch = textUntilPosition.match(/(\w+)\.\s*$/);

      let suggestions = ocamlCompletions;
      if (moduleMatch) {
        const moduleName = moduleMatch[1];
        suggestions = ocamlCompletions.filter((c: any) =>
          c.label.startsWith(moduleName + '.')
        );
      }

      const kindMap: Record<string, number> = {
        'Keyword': 17,
        'Function': 1,
        'Snippet': 27,
        'Variable': 5,
      };

      const localSuggestions = suggestions.map((item: any) => ({
        label: item.label,
        kind: kindMap[item.kind] || 1,
        insertText: item.insertText,
        insertTextRules: item.insertTextRules,
        detail: item.detail,
        range,
      }));

      // Also query Merlin for completions (async, best-effort)
      const caps = useStore.getState().capabilities;
      if (caps.merlin) {
        try {
          const code = model.getValue();
          const prefix = word.word;
          const result = await api.merlinComplete(code, { line: position.lineNumber, column: position.column - 1 }, prefix);
          if (result.backend && result.completions.length > 0) {
            const merlinKindMap: Record<string, number> = {
              'Value': 5, 'Type': 7, 'Constructor': 12,
              'Label': 4, 'Module': 8, 'Keyword': 17,
            };
            const merlinSuggestions = result.completions.map((c: any) => ({
              label: c.label,
              kind: merlinKindMap[c.kind] || 1,
              insertText: c.label,
              detail: c.detail || '',
              documentation: c.documentation || undefined,
              range,
              sortText: '0' + c.label,
            }));
            return { suggestions: [...merlinSuggestions, ...localSuggestions] };
          }
        } catch {
          // Merlin completions failed — fallback to local
        }
      }

      return { suggestions: localSuggestions };
    },
    triggerCharacters: ['.'],
  });

  // Define OCaml theme
  monaco.editor.defineTheme('caraml-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'c678dd', fontStyle: 'bold' },
      { token: 'type', foreground: '56b6c2' },
      { token: 'type.identifier', foreground: 'e5c07b' },
      { token: 'identifier', foreground: 'abb2bf' },
      { token: 'number', foreground: 'd19a66' },
      { token: 'number.float', foreground: 'd19a66' },
      { token: 'number.hex', foreground: 'd19a66' },
      { token: 'string', foreground: '98c379' },
      { token: 'string.char', foreground: '98c379' },
      { token: 'string.escape', foreground: '56b6c2' },
      { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
      { token: 'operator', foreground: '56b6c2' },
      { token: 'delimiter', foreground: 'abb2bf' },
      { token: '', foreground: 'abb2bf' },
    ],
    colors: {
      'editor.background': '#0a0e1a',
      'editor.foreground': '#abb2bf',
      'editor.lineHighlightBackground': '#1e293b40',
      'editor.selectionBackground': '#264f7840',
      'editor.inactiveSelectionBackground': '#264f7820',
      'editorCursor.foreground': '#06b6d4',
      'editorLineNumber.foreground': '#475569',
      'editorLineNumber.activeForeground': '#94a3b8',
      'editorIndentGuide.background': '#1e293b',
      'editorIndentGuide.activeBackground': '#334155',
      'editor.selectionHighlightBackground': '#264f7830',
      'editorBracketMatch.background': '#264f7830',
      'editorBracketMatch.border': '#06b6d480',
      'editorGutter.background': '#0a0e1a',
      'editorWidget.background': '#111827',
      'editorWidget.border': '#1e293b',
      'input.background': '#1e293b',
      'input.border': '#334155',
      'dropdown.background': '#111827',
      'list.hoverBackground': '#1e293b',
      'list.activeSelectionBackground': '#1e3a5f',
      'minimap.background': '#0a0e1a',
    },
  });
}

export function Editor({ onRun }: EditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const {
    currentProject, activeFile, updateFileContent, editorFontSize,
    executionResult,
  } = useStore();

  const content = currentProject?.files[activeFile]?.content || '';

  const handleEditorBeforeMount: BeforeMount = (monaco) => {
    registerOcamlLanguage(monaco);
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Key bindings
    editor.addAction({
      id: 'run-code',
      label: 'Run Code',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => onRun?.(),
    });

    editor.addAction({
      id: 'save-project',
      label: 'Save Project',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => useStore.getState().saveProject(),
    });

    // Register Merlin hover provider for type info
    monaco.languages.registerHoverProvider('ocaml', {
      provideHover: async (model: any, position: any) => {
        const caps = useStore.getState().capabilities;
        if (!caps.merlin) return null;
        try {
          const code = model.getValue();
          const result = await api.merlinType(code, { line: position.lineNumber, column: position.column - 1 });
          if (result.backend && result.type) {
            return {
              contents: [{ value: `**Type:** \`${result.type}\`` }],
            };
          }
        } catch {}
        return null;
      },
    });

    // Debounced Merlin error checking
    let merlinTimer: ReturnType<typeof setTimeout> | null = null;
    editor.onDidChangeModelContent(() => {
      if (merlinTimer) clearTimeout(merlinTimer);
      merlinTimer = setTimeout(async () => {
        const caps = useStore.getState().capabilities;
        if (!caps.merlin) return;
        const model = editor.getModel();
        if (!model) return;
        try {
          const result = await api.merlinErrors(model.getValue());
          if (result.backend && result.errors.length > 0) {
            const markers = result.errors.map((e: any) => ({
              severity: e.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
              startLineNumber: e.line || 1,
              startColumn: (e.column || 0) + 1,
              endLineNumber: e.endLine || e.line || 1,
              endColumn: (e.endColumn || 1000) + 1,
              message: e.message,
              source: 'merlin',
            }));
            monaco.editor.setModelMarkers(model, 'merlin', markers);
          } else {
            monaco.editor.setModelMarkers(model, 'merlin', []);
          }
        } catch {
          // Merlin error check failed silently
        }
      }, 1000); // 1 second debounce
    });

    editor.focus();
  };

  // Update markers when execution result changes
  useEffect(() => {
    if (!editorRef.current) return;
    const monaco = (window as any).monaco;
    if (!monaco) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    if (executionResult?.errors && executionResult.errors.length > 0) {
      const markers = executionResult.errors.map((err: any) => ({
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: err.line || 1,
        startColumn: err.column || 1,
        endLineNumber: err.line || 1,
        endColumn: 1000,
        message: err.message,
      }));
      monaco.editor.setModelMarkers(model, 'ocaml', markers);
    } else {
      monaco.editor.setModelMarkers(model, 'ocaml', []);
    }
  }, [executionResult]);

  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined && activeFile) {
      updateFileContent(activeFile, value);
    }
  }, [activeFile, updateFileContent]);

  if (!activeFile || !currentProject?.files[activeFile]) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500">
        <div className="text-center">
          <div className="text-4xl mb-4">🐫</div>
          <p className="text-lg font-medium">No file open</p>
          <p className="text-sm mt-1">Select a file from the sidebar or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <MonacoEditor
      language="ocaml"
      theme="caraml-dark"
      value={content}
      onChange={handleChange}
      beforeMount={handleEditorBeforeMount}
      onMount={handleEditorMount}
      options={{
        fontSize: editorFontSize,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontLigatures: true,
        minimap: { enabled: true, scale: 1 },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        renderLineHighlight: 'all',
        lineNumbers: 'on',
        lineDecorationsWidth: 10,
        lineNumbersMinChars: 3,
        glyphMargin: true,
        folding: true,
        foldingStrategy: 'indentation',
        automaticLayout: true,
        tabSize: 4,
        insertSpaces: true,
        detectIndentation: false,
        wordWrap: 'off',
        padding: { top: 12, bottom: 12 },
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        acceptSuggestionOnCommitCharacter: true,
        snippetSuggestions: 'top',
        bracketPairColorization: { enabled: true },
        guides: {
          bracketPairs: true,
          indentation: true,
        },
        scrollbar: {
          verticalScrollbarSize: 8,
          horizontalScrollbarSize: 8,
        },
        overviewRulerBorder: false,
      }}
    />
  );
}
