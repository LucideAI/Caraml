import { Token, TokenType, ParseError } from './types';

const KEYWORDS: Record<string, TokenType> = {
  'let': TokenType.LET, 'rec': TokenType.REC, 'in': TokenType.IN, 'and': TokenType.AND,
  'fun': TokenType.FUN, 'function': TokenType.FUNCTION,
  'if': TokenType.IF, 'then': TokenType.THEN, 'else': TokenType.ELSE,
  'match': TokenType.MATCH, 'with': TokenType.WITH,
  'type': TokenType.TYPE, 'of': TokenType.OF,
  'begin': TokenType.BEGIN, 'end': TokenType.END,
  'true': TokenType.TRUE, 'false': TokenType.FALSE,
  'not': TokenType.NOT, 'mod': TokenType.MOD, 'ref': TokenType.REF,
  'try': TokenType.TRY, 'raise': TokenType.RAISE, 'exception': TokenType.EXCEPTION,
  'open': TokenType.OPEN, 'module': TokenType.MODULE,
  'struct': TokenType.STRUCT, 'sig': TokenType.SIG,
  'for': TokenType.FOR, 'while': TokenType.WHILE, 'do': TokenType.DO,
  'done': TokenType.DONE, 'to': TokenType.TO, 'downto': TokenType.DOWNTO,
  'mutable': TokenType.MUTABLE,
};

export class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    this.tokens = [];
    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) break;

      const ch = this.source[this.pos];
      const startLine = this.line;
      const startCol = this.column;

      // String
      if (ch === '"') {
        this.tokens.push(this.readString(startLine, startCol));
        continue;
      }

      // Char
      if (ch === "'" && this.pos + 1 < this.source.length) {
        const next = this.source[this.pos + 1];
        // Check if this is actually a char literal
        if (next === '\\') {
          // Escape sequence
          if (this.pos + 3 < this.source.length && this.source[this.pos + 3] === "'") {
            this.tokens.push(this.readChar(startLine, startCol));
            continue;
          }
        } else if (this.pos + 2 < this.source.length && this.source[this.pos + 2] === "'") {
          this.tokens.push(this.readChar(startLine, startCol));
          continue;
        }
        // Otherwise it might be a type variable like 'a — treat as a quote prefix on ident
        if (/[a-z]/.test(next)) {
          this.advance(); // skip '
          const ident = this.readIdentifier();
          this.tokens.push({ type: TokenType.IDENT, value: "'" + ident, line: startLine, column: startCol });
          continue;
        }
      }

      // Numbers
      if (/[0-9]/.test(ch)) {
        this.tokens.push(this.readNumber(startLine, startCol));
        continue;
      }

      // Negative number after operator or at start
      if (ch === '-' && this.pos + 1 < this.source.length && /[0-9]/.test(this.source[this.pos + 1])) {
        const lastToken = this.tokens[this.tokens.length - 1];
        if (!lastToken || [TokenType.LPAREN, TokenType.LBRACKET, TokenType.SEMICOLON, TokenType.SEMISEMI,
          TokenType.COMMA, TokenType.ARROW, TokenType.EQ, TokenType.PIPE, TokenType.LET, TokenType.IN,
          TokenType.IF, TokenType.THEN, TokenType.ELSE, TokenType.FUN, TokenType.FUNCTION, TokenType.MATCH,
          TokenType.WITH, TokenType.OF, TokenType.BEGIN, TokenType.DO, TokenType.TO, TokenType.DOWNTO,
          TokenType.PLUS, TokenType.MINUS, TokenType.STAR, TokenType.SLASH, TokenType.COLONEQUAL,
          TokenType.COLONCOLON, TokenType.AT, TokenType.CARET, TokenType.AMPAMP, TokenType.PIPEPIPE,
          TokenType.LT, TokenType.GT, TokenType.LE, TokenType.GE, TokenType.EQ, TokenType.NEQ,
        ].includes(lastToken.type)) {
          this.advance();
          const numToken = this.readNumber(startLine, startCol);
          if (numToken.type === TokenType.FLOAT) {
            numToken.value = '-' + numToken.value;
          } else {
            numToken.value = '-' + numToken.value;
          }
          this.tokens.push(numToken);
          continue;
        }
      }

      // Identifiers and keywords
      if (/[a-z_]/.test(ch)) {
        const ident = this.readIdentifier();
        const kwType = KEYWORDS[ident];
        if (kwType) {
          this.tokens.push({ type: kwType, value: ident, line: startLine, column: startCol });
        } else {
          this.tokens.push({ type: TokenType.IDENT, value: ident, line: startLine, column: startCol });
        }
        continue;
      }

      // Upper-case identifiers (constructors, modules)
      if (/[A-Z]/.test(ch)) {
        const ident = this.readIdentifier();
        this.tokens.push({ type: TokenType.UPPER_IDENT, value: ident, line: startLine, column: startCol });
        continue;
      }

      // Operators and symbols
      this.tokens.push(this.readSymbol(startLine, startCol));
    }

    this.tokens.push({ type: TokenType.EOF, value: '', line: this.line, column: this.column });
    return this.tokens;
  }

  private advance(): string {
    const ch = this.source[this.pos];
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  private peek(): string {
    return this.pos < this.source.length ? this.source[this.pos] : '\0';
  }

  private peekAt(offset: number): string {
    const p = this.pos + offset;
    return p < this.source.length ? this.source[p] : '\0';
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (/\s/.test(ch)) {
        this.advance();
        continue;
      }
      // Block comments (* ... *) — supports nesting
      if (ch === '(' && this.peekAt(1) === '*') {
        this.advance(); // (
        this.advance(); // *
        let depth = 1;
        while (this.pos < this.source.length && depth > 0) {
          if (this.peek() === '(' && this.peekAt(1) === '*') {
            this.advance(); this.advance();
            depth++;
          } else if (this.peek() === '*' && this.peekAt(1) === ')') {
            this.advance(); this.advance();
            depth--;
          } else {
            this.advance();
          }
        }
        continue;
      }
      break;
    }
  }

  private readString(startLine: number, startCol: number): Token {
    this.advance(); // skip "
    let value = '';
    while (this.pos < this.source.length && this.peek() !== '"') {
      if (this.peek() === '\\') {
        this.advance();
        const esc = this.advance();
        switch (esc) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case 'r': value += '\r'; break;
          case '\\': value += '\\'; break;
          case '"': value += '"'; break;
          case "'": value += "'"; break;
          default: value += '\\' + esc;
        }
      } else {
        value += this.advance();
      }
    }
    if (this.pos < this.source.length) this.advance(); // skip closing "
    return { type: TokenType.STRING, value, line: startLine, column: startCol };
  }

  private readChar(startLine: number, startCol: number): Token {
    this.advance(); // skip '
    let value = '';
    if (this.peek() === '\\') {
      this.advance();
      const esc = this.advance();
      switch (esc) {
        case 'n': value = '\n'; break;
        case 't': value = '\t'; break;
        case 'r': value = '\r'; break;
        case '\\': value = '\\'; break;
        case "'": value = "'"; break;
        default: value = esc;
      }
    } else {
      value = this.advance();
    }
    if (this.peek() === "'") this.advance(); // skip closing '
    return { type: TokenType.CHAR, value, line: startLine, column: startCol };
  }

  private readNumber(startLine: number, startCol: number): Token {
    let value = '';
    let isFloat = false;

    while (this.pos < this.source.length && /[0-9_]/.test(this.peek())) {
      if (this.peek() !== '_') value += this.peek();
      this.advance();
    }

    if (this.peek() === '.' && this.peekAt(1) !== '.') {
      isFloat = true;
      value += this.advance();
      while (this.pos < this.source.length && /[0-9_]/.test(this.peek())) {
        if (this.peek() !== '_') value += this.peek();
        this.advance();
      }
    }

    if (this.peek() === 'e' || this.peek() === 'E') {
      isFloat = true;
      value += this.advance();
      if (this.peek() === '+' || this.peek() === '-') value += this.advance();
      while (this.pos < this.source.length && /[0-9]/.test(this.peek())) {
        value += this.advance();
      }
    }

    return {
      type: isFloat ? TokenType.FLOAT : TokenType.INT,
      value,
      line: startLine,
      column: startCol,
    };
  }

  private readIdentifier(): string {
    let value = '';
    while (this.pos < this.source.length && /[a-zA-Z0-9_']/.test(this.peek())) {
      value += this.advance();
    }
    return value;
  }

  private readSymbol(startLine: number, startCol: number): Token {
    const ch = this.advance();
    const next = this.peek();

    const tok = (type: TokenType, value: string) => ({ type, value, line: startLine, column: startCol });

    switch (ch) {
      case '(':
        if (next === ')') { this.advance(); return tok(TokenType.IDENT, '()'); }
        return tok(TokenType.LPAREN, '(');
      case ')': return tok(TokenType.RPAREN, ')');
      case '[':
        if (next === '|') { this.advance(); return tok(TokenType.LBRACKET, '[|'); }
        if (next === ']') { this.advance(); return tok(TokenType.LBRACKET, '[]'); }
        return tok(TokenType.LBRACKET, '[');
      case ']': return tok(TokenType.RBRACKET, ']');
      case '{': return tok(TokenType.LBRACE, '{');
      case '}': return tok(TokenType.RBRACE, '}');
      case ';':
        if (next === ';') { this.advance(); return tok(TokenType.SEMISEMI, ';;'); }
        return tok(TokenType.SEMICOLON, ';');
      case ':':
        if (next === ':') { this.advance(); return tok(TokenType.COLONCOLON, '::'); }
        if (next === '=') { this.advance(); return tok(TokenType.COLONEQUAL, ':='); }
        return tok(TokenType.COLON, ':');
      case ',': return tok(TokenType.COMMA, ',');
      case '.': return tok(TokenType.DOT, '.');
      case '|':
        if (next === '|') { this.advance(); return tok(TokenType.PIPEPIPE, '||'); }
        if (next === '>') { this.advance(); return tok(TokenType.PIPE_GT, '|>'); }
        if (next === ']') { this.advance(); return tok(TokenType.RBRACKET, '|]'); }
        return tok(TokenType.PIPE, '|');
      case '&':
        if (next === '&') { this.advance(); return tok(TokenType.AMPAMP, '&&'); }
        return tok(TokenType.IDENT, '&');
      case '-':
        if (next === '>') { this.advance(); return tok(TokenType.ARROW, '->'); }
        if (next === '.') { this.advance(); return tok(TokenType.MINUS_DOT, '-.'); }
        return tok(TokenType.MINUS, '-');
      case '+':
        if (next === '.') { this.advance(); return tok(TokenType.PLUS_DOT, '+.'); }
        return tok(TokenType.PLUS, '+');
      case '*':
        if (next === '.') { this.advance(); return tok(TokenType.STAR_DOT, '*.'); }
        return tok(TokenType.STAR, '*');
      case '/':
        if (next === '.') { this.advance(); return tok(TokenType.SLASH_DOT, '/.'); }
        return tok(TokenType.SLASH, '/');
      case '=':
        if (next === '=') { this.advance(); return tok(TokenType.PHYSICAL_EQ, '=='); }
        return tok(TokenType.EQ, '=');
      case '<':
        if (next === '=') { this.advance(); return tok(TokenType.LE, '<='); }
        if (next === '>') { this.advance(); return tok(TokenType.NEQ, '<>'); }
        return tok(TokenType.LT, '<');
      case '>':
        if (next === '=') { this.advance(); return tok(TokenType.GE, '>='); }
        return tok(TokenType.GT, '>');
      case '!':
        if (next === '=') { this.advance(); return tok(TokenType.PHYSICAL_NEQ, '!='); }
        return tok(TokenType.BANG, '!');
      case '^': return tok(TokenType.CARET, '^');
      case '@': return tok(TokenType.AT, '@');
      case '_': return tok(TokenType.UNDERSCORE, '_');
      case '#': return tok(TokenType.HASH, '#');
      case '~': return tok(TokenType.IDENT, '~');
      default:
        throw new ParseError(`Unexpected character: '${ch}'`, startLine, startCol);
    }
  }
}
