// ══════════════════════════════════════════════════════════════════════════════
// OCaml Interpreter Type Definitions
// ══════════════════════════════════════════════════════════════════════════════

// ── Token Types ─────────────────────────────────────────────────────────────
export enum TokenType {
  // Literals
  INT = 'INT', FLOAT = 'FLOAT', STRING = 'STRING', CHAR = 'CHAR',

  // Identifiers
  IDENT = 'IDENT', UPPER_IDENT = 'UPPER_IDENT',

  // Keywords
  LET = 'LET', REC = 'REC', IN = 'IN', AND = 'AND',
  FUN = 'FUN', FUNCTION = 'FUNCTION',
  IF = 'IF', THEN = 'THEN', ELSE = 'ELSE',
  MATCH = 'MATCH', WITH = 'WITH',
  TYPE = 'TYPE', OF = 'OF',
  BEGIN = 'BEGIN', END = 'END',
  TRUE = 'TRUE', FALSE = 'FALSE',
  NOT = 'NOT', MOD = 'MOD', REF = 'REF',
  TRY = 'TRY', RAISE = 'RAISE', EXCEPTION = 'EXCEPTION',
  OPEN = 'OPEN', MODULE = 'MODULE', STRUCT = 'STRUCT', SIG = 'SIG',
  FOR = 'FOR', WHILE = 'WHILE', DO = 'DO', DONE = 'DONE', TO = 'TO', DOWNTO = 'DOWNTO',
  MUTABLE = 'MUTABLE',

  // Symbols
  LPAREN = 'LPAREN', RPAREN = 'RPAREN',
  LBRACKET = 'LBRACKET', RBRACKET = 'RBRACKET',
  LBRACE = 'LBRACE', RBRACE = 'RBRACE',
  SEMICOLON = 'SEMICOLON', SEMISEMI = 'SEMISEMI',
  COLON = 'COLON', COLONCOLON = 'COLONCOLON',
  COMMA = 'COMMA', DOT = 'DOT',
  ARROW = 'ARROW', PIPE = 'PIPE', UNDERSCORE = 'UNDERSCORE',
  HASH = 'HASH',

  // Operators
  PLUS = 'PLUS', MINUS = 'MINUS', STAR = 'STAR', SLASH = 'SLASH',
  PLUS_DOT = 'PLUS_DOT', MINUS_DOT = 'MINUS_DOT', STAR_DOT = 'STAR_DOT', SLASH_DOT = 'SLASH_DOT',
  EQ = 'EQ', NEQ = 'NEQ', LT = 'LT', GT = 'GT', LE = 'LE', GE = 'GE',
  PHYSICAL_EQ = 'PHYSICAL_EQ', PHYSICAL_NEQ = 'PHYSICAL_NEQ',
  AMPAMP = 'AMPAMP', PIPEPIPE = 'PIPEPIPE',
  CARET = 'CARET', AT = 'AT',
  BANG = 'BANG', COLONEQUAL = 'COLONEQUAL',
  PIPE_GT = 'PIPE_GT',

  // Special
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

// ── AST Node Types ──────────────────────────────────────────────────────────
export type ASTNode =
  | LiteralNode
  | VarNode
  | LetNode
  | LetRecNode
  | FunNode
  | AppNode
  | BinOpNode
  | UnaryOpNode
  | IfNode
  | MatchNode
  | TupleNode
  | ListNode
  | ConsNode
  | SequenceNode
  | RefNode
  | DerefNode
  | AssignNode
  | TypeDeclNode
  | ExceptionDeclNode
  | RaiseNode
  | TryWithNode
  | BeginEndNode
  | ConstructorNode
  | RecordNode
  | FieldAccessNode
  | UnitNode
  | ForNode
  | WhileNode
  | ArrayNode
  | ArrayAccessNode
  | ArraySetNode
  | OpenNode
  | PrintfNode;

export interface LiteralNode { kind: 'literal'; type: 'int' | 'float' | 'string' | 'char' | 'bool'; value: any; line: number; }
export interface UnitNode { kind: 'unit'; line: number; }
export interface VarNode { kind: 'var'; name: string; line: number; }
export interface LetNode { kind: 'let'; name: string; params: Pattern[]; body: ASTNode; inExpr?: ASTNode; line: number; }
export interface LetRecNode { kind: 'letrec'; name: string; params: Pattern[]; body: ASTNode; inExpr?: ASTNode; line: number; }
export interface FunNode { kind: 'fun'; params: Pattern[]; body: ASTNode; line: number; }
export interface AppNode { kind: 'app'; func: ASTNode; args: ASTNode[]; line: number; }
export interface BinOpNode { kind: 'binop'; op: string; left: ASTNode; right: ASTNode; line: number; }
export interface UnaryOpNode { kind: 'unary'; op: string; expr: ASTNode; line: number; }
export interface IfNode { kind: 'if'; cond: ASTNode; then: ASTNode; else?: ASTNode; line: number; }
export interface MatchNode { kind: 'match'; expr: ASTNode; cases: MatchCase[]; line: number; }
export interface TupleNode { kind: 'tuple'; elements: ASTNode[]; line: number; }
export interface ListNode { kind: 'list'; elements: ASTNode[]; line: number; }
export interface ConsNode { kind: 'cons'; head: ASTNode; tail: ASTNode; line: number; }
export interface SequenceNode { kind: 'sequence'; exprs: ASTNode[]; line: number; }
export interface RefNode { kind: 'ref'; expr: ASTNode; line: number; }
export interface DerefNode { kind: 'deref'; expr: ASTNode; line: number; }
export interface AssignNode { kind: 'assign'; ref: ASTNode; value: ASTNode; line: number; }
export interface TypeDeclNode { kind: 'typedecl'; name: string; params: string[]; variants: { name: string; type?: string }[]; line: number; }
export interface ExceptionDeclNode { kind: 'exceptiondecl'; name: string; type?: string; line: number; }
export interface RaiseNode { kind: 'raise'; expr: ASTNode; line: number; }
export interface TryWithNode { kind: 'trywith'; expr: ASTNode; cases: MatchCase[]; line: number; }
export interface BeginEndNode { kind: 'begin'; expr: ASTNode; line: number; }
export interface ConstructorNode { kind: 'constructor'; name: string; arg?: ASTNode; line: number; }
export interface RecordNode { kind: 'record'; fields: { name: string; value: ASTNode }[]; line: number; }
export interface FieldAccessNode { kind: 'fieldaccess'; expr: ASTNode; field: string; line: number; }
export interface ForNode { kind: 'for'; var: string; start: ASTNode; end: ASTNode; up: boolean; body: ASTNode; line: number; }
export interface WhileNode { kind: 'while'; cond: ASTNode; body: ASTNode; line: number; }
export interface ArrayNode { kind: 'array'; elements: ASTNode[]; line: number; }
export interface ArrayAccessNode { kind: 'arrayaccess'; array: ASTNode; index: ASTNode; line: number; }
export interface ArraySetNode { kind: 'arrayset'; array: ASTNode; index: ASTNode; value: ASTNode; line: number; }
export interface OpenNode { kind: 'open'; module: string; line: number; }
export interface PrintfNode { kind: 'printf'; format: string; args: ASTNode[]; line: number; }

// ── Pattern Types ───────────────────────────────────────────────────────────
export type Pattern =
  | { kind: 'pvar'; name: string }
  | { kind: 'pwild' }
  | { kind: 'pliteral'; type: string; value: any }
  | { kind: 'ptuple'; elements: Pattern[] }
  | { kind: 'plist'; elements: Pattern[] }
  | { kind: 'pcons'; head: Pattern; tail: Pattern }
  | { kind: 'pconstructor'; name: string; arg?: Pattern }
  | { kind: 'punit' }
  | { kind: 'por'; left: Pattern; right: Pattern };

export interface MatchCase {
  pattern: Pattern;
  guard?: ASTNode;
  body: ASTNode;
}

// ── Value Types ─────────────────────────────────────────────────────────────
export type Value =
  | VInt | VFloat | VString | VChar | VBool | VUnit
  | VList | VTuple | VFun | VRecFun | VRef | VConstructor
  | VBuiltin | VRecord | VArray;

export interface VInt { tag: 'int'; value: number; }
export interface VFloat { tag: 'float'; value: number; }
export interface VString { tag: 'string'; value: string; }
export interface VChar { tag: 'char'; value: string; }
export interface VBool { tag: 'bool'; value: boolean; }
export interface VUnit { tag: 'unit'; }
export interface VList { tag: 'list'; elements: Value[]; }
export interface VTuple { tag: 'tuple'; elements: Value[]; }
export interface VFun { tag: 'fun'; params: Pattern[]; body: ASTNode; env: Environment; }
export interface VRecFun { tag: 'recfun'; name: string; params: Pattern[]; body: ASTNode; env: Environment; }
export interface VRef { tag: 'ref'; value: Value; id: number; }
export interface VConstructor { tag: 'constructor'; name: string; value?: Value; }
export interface VBuiltin { tag: 'builtin'; name: string; fn: (args: Value[]) => Value; arity: number; applied: Value[]; }
export interface VRecord { tag: 'record'; fields: Map<string, Value>; }
export interface VArray { tag: 'array'; elements: Value[]; id: number; }

// ── Environment ─────────────────────────────────────────────────────────────
export class Environment {
  bindings: Map<string, Value>;
  parent: Environment | null;
  name: string;

  constructor(parent: Environment | null = null, name: string = 'global') {
    this.bindings = new Map();
    this.parent = parent;
    this.name = name;
  }

  get(name: string): Value | undefined {
    const val = this.bindings.get(name);
    if (val !== undefined) return val;
    if (this.parent) return this.parent.get(name);
    return undefined;
  }

  set(name: string, value: Value): void {
    this.bindings.set(name, value);
  }

  extend(name: string = 'local'): Environment {
    return new Environment(this, name);
  }

  allBindings(): Map<string, Value> {
    const result = new Map<string, Value>();
    if (this.parent) {
      for (const [k, v] of this.parent.allBindings()) {
        result.set(k, v);
      }
    }
    for (const [k, v] of this.bindings) {
      result.set(k, v);
    }
    return result;
  }
}

// ── Error Types ─────────────────────────────────────────────────────────────
export class OCamlError extends Error {
  line: number;
  column: number;
  kind: string;

  constructor(message: string, line: number = 0, column: number = 0, kind: string = 'Error') {
    super(message);
    this.line = line;
    this.column = column;
    this.kind = kind;
  }
}

export class ParseError extends OCamlError {
  constructor(message: string, line: number = 0, column: number = 0) {
    super(message, line, column, 'Syntax error');
  }
}

export class TypeError extends OCamlError {
  constructor(message: string, line: number = 0) {
    super(message, line, 0, 'Type error');
  }
}

export class RuntimeError extends OCamlError {
  constructor(message: string, line: number = 0) {
    super(message, line, 0, 'Runtime error');
  }
}

export class MatchFailure extends OCamlError {
  constructor(line: number = 0) {
    super('Match failure', line, 0, 'Exception');
  }
}
