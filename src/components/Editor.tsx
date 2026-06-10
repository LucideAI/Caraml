import { useRef, useEffect, useCallback } from 'react';
import MonacoEditor, { OnMount, BeforeMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useStore } from '../store';
import { api } from '../services/api';
import { registerOcamlLanguage } from '../editor/registerOcaml';

// Re-export for backward compatibility
export { registerOcamlLanguage } from '../editor/registerOcaml';

interface EditorProps {
  onRun?: () => void;
}

export function Editor({ onRun }: EditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const onRunRef = useRef(onRun);
  const {
    currentProject, activeFile, updateFileContent, editorFontSize,
    executionResult, theme,
  } = useStore();

  const content = currentProject?.files[activeFile]?.content || '';

  useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);

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
      run: () => onRunRef.current?.(),
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
      <div className="flex-1 flex items-center justify-center text-t-faint">
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
      theme={theme === 'dark' ? 'caraml-dark' : 'caraml-light'}
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
