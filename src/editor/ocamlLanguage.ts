// OCaml language definition for Monaco
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

// OCaml auto-completion items
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
