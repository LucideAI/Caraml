import { ocamlLanguageDef, ocamlCompletions } from './ocamlLanguage';
import { caramlDarkTheme, caramlLightTheme } from './ocamlThemes';
import { useStore } from '../store';
import { api } from '../services/api';

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

  // Define themes
  monaco.editor.defineTheme('caraml-dark', caramlDarkTheme);
  monaco.editor.defineTheme('caraml-light', caramlLightTheme);
}
