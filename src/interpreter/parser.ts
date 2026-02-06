import {
  Token, TokenType, ASTNode, Pattern, MatchCase,
  ParseError,
} from './types';

export class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ASTNode[] {
    const statements: ASTNode[] = [];
    while (!this.isAtEnd()) {
      this.skipSemiSemi();
      if (this.isAtEnd()) break;
      try {
        statements.push(this.parseTopLevel());
      } catch (e) {
        if (e instanceof ParseError) throw e;
        throw e;
      }
      this.skipSemiSemi();
    }
    return statements;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  private current(): Token { return this.tokens[this.pos]; }
  private peek(): TokenType { return this.current().type; }
  private isAtEnd(): boolean { return this.peek() === TokenType.EOF; }

  private advance(): Token {
    const tok = this.current();
    if (!this.isAtEnd()) this.pos++;
    return tok;
  }

  private expect(type: TokenType, msg?: string): Token {
    if (this.peek() !== type) {
      const cur = this.current();
      throw new ParseError(
        msg || `Expected ${type} but got ${cur.type} '${cur.value}'`,
        cur.line, cur.column
      );
    }
    return this.advance();
  }

  private match(...types: TokenType[]): Token | null {
    if (types.includes(this.peek())) return this.advance();
    return null;
  }

  private skipSemiSemi(): void {
    while (this.peek() === TokenType.SEMISEMI) this.advance();
  }

  // ── Top Level ───────────────────────────────────────────────────────────
  private parseTopLevel(): ASTNode {
    const tok = this.current();

    if (tok.type === TokenType.LET) return this.parseLet(false);
    if (tok.type === TokenType.TYPE) return this.parseTypeDecl();
    if (tok.type === TokenType.EXCEPTION) return this.parseExceptionDecl();
    if (tok.type === TokenType.OPEN) return this.parseOpen();

    return this.parseExpr();
  }

  // ── Open ────────────────────────────────────────────────────────────────
  private parseOpen(): ASTNode {
    const tok = this.advance(); // open
    const mod = this.expect(TokenType.UPPER_IDENT);
    return { kind: 'open', module: mod.value, line: tok.line };
  }

  // ── Type Declaration ────────────────────────────────────────────────────
  private parseTypeDecl(): ASTNode {
    const tok = this.advance(); // type
    const params: string[] = [];

    // Optional type params: 'a or ('a, 'b)
    if (this.peek() === TokenType.IDENT && this.current().value.startsWith("'")) {
      params.push(this.advance().value);
    } else if (this.peek() === TokenType.LPAREN) {
      this.advance();
      while (true) {
        if (this.peek() === TokenType.IDENT && this.current().value.startsWith("'")) {
          params.push(this.advance().value);
        }
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RPAREN);
    }

    const name = this.expect(TokenType.IDENT).value;
    this.expect(TokenType.EQ);

    // Parse variants
    this.match(TokenType.PIPE); // optional leading |
    const variants: { name: string; type?: string }[] = [];

    if (this.peek() === TokenType.UPPER_IDENT) {
      do {
        const variantName = this.expect(TokenType.UPPER_IDENT).value;
        let variantType: string | undefined;
        if (this.match(TokenType.OF)) {
          variantType = this.parseTypeAnnotation();
        }
        variants.push({ name: variantName, type: variantType });
      } while (this.match(TokenType.PIPE));
    } else if (this.peek() === TokenType.LBRACE) {
      // Record type - simplified
      this.advance();
      const fields: string[] = [];
      while (this.peek() !== TokenType.RBRACE && !this.isAtEnd()) {
        this.match(TokenType.MUTABLE);
        const fname = this.expect(TokenType.IDENT).value;
        this.expect(TokenType.COLON);
        const ftype = this.parseTypeAnnotation();
        fields.push(`${fname}: ${ftype}`);
        this.match(TokenType.SEMICOLON);
      }
      this.expect(TokenType.RBRACE);
      variants.push({ name: '{' + fields.join('; ') + '}' });
    } else {
      // Type alias
      const aliasType = this.parseTypeAnnotation();
      variants.push({ name: aliasType });
    }

    return { kind: 'typedecl', name, params, variants, line: tok.line };
  }

  private parseTypeAnnotation(): string {
    let result = this.parseSimpleType();
    while (this.peek() === TokenType.ARROW) {
      this.advance();
      result += ' -> ' + this.parseSimpleType();
    }
    if (this.peek() === TokenType.STAR) {
      while (this.match(TokenType.STAR)) {
        result += ' * ' + this.parseSimpleType();
      }
    }
    return result;
  }

  private parseSimpleType(): string {
    if (this.peek() === TokenType.LPAREN) {
      this.advance();
      const inner = this.parseTypeAnnotation();
      this.expect(TokenType.RPAREN);
      return '(' + inner + ')';
    }
    if (this.peek() === TokenType.IDENT) {
      let t = this.advance().value;
      if (this.peek() === TokenType.IDENT) {
        t += ' ' + this.advance().value;
      } else if (this.peek() === TokenType.UPPER_IDENT) {
        t += ' ' + this.advance().value;
        while (this.match(TokenType.DOT)) {
          t += '.' + this.advance().value;
        }
      }
      return t;
    }
    if (this.peek() === TokenType.UPPER_IDENT) {
      let t = this.advance().value;
      while (this.match(TokenType.DOT)) {
        t += '.' + this.advance().value;
      }
      return t;
    }
    return this.advance().value;
  }

  // ── Exception Declaration ───────────────────────────────────────────────
  private parseExceptionDecl(): ASTNode {
    const tok = this.advance(); // exception
    const name = this.expect(TokenType.UPPER_IDENT).value;
    let type: string | undefined;
    if (this.match(TokenType.OF)) {
      type = this.parseTypeAnnotation();
    }
    return { kind: 'exceptiondecl', name, type, line: tok.line };
  }

  // ── Let / Let Rec ──────────────────────────────────────────────────────
  private parseLet(requireIn: boolean): ASTNode {
    const tok = this.advance(); // let
    const isRec = !!this.match(TokenType.REC);

    // let () = ...  (unit pattern)
    if (this.peek() === TokenType.IDENT && this.current().value === '()') {
      this.advance(); // ()
      this.expect(TokenType.EQ);
      const body = this.parseExpr();
      const inExpr = this.match(TokenType.IN) ? this.parseExpr() : undefined;
      return {
        kind: isRec ? 'letrec' : 'let',
        name: '()',
        params: [],
        body,
        inExpr,
        line: tok.line,
      };
    }

    // Parse name/pattern
    let name: string;
    if (this.peek() === TokenType.IDENT) {
      name = this.advance().value;
    } else if (this.peek() === TokenType.LPAREN) {
      // Could be a tuple pattern or operator like let (+) = ...
      // For now, handle simple case
      name = '_tuple_' + tok.line;
      // Parse as expression
      const pattern = this.parsePattern();
      this.expect(TokenType.EQ);
      const body = this.parseExpr();
      const inExpr = this.match(TokenType.IN) ? this.parseExpr() : undefined;
      return { kind: 'let', name: this.patternToName(pattern), params: [], body, inExpr, line: tok.line };
    } else if (this.peek() === TokenType.UNDERSCORE) {
      this.advance();
      name = '_';
    } else {
      throw new ParseError(`Expected identifier after 'let'`, tok.line, tok.column);
    }

    // Parse parameters
    const params: Pattern[] = [];
    while (this.isParamStart()) {
      params.push(this.parseSimplePattern());
    }

    // Type annotation (optional, skip for now)
    if (this.match(TokenType.COLON)) {
      this.parseTypeAnnotation();
    }

    this.expect(TokenType.EQ);
    const body = this.parseExpr();
    const inExpr = this.match(TokenType.IN) ? this.parseExpr() : undefined;

    return {
      kind: isRec ? 'letrec' : 'let',
      name,
      params,
      body,
      inExpr,
      line: tok.line,
    };
  }

  private patternToName(p: Pattern): string {
    if (p.kind === 'pvar') return p.name;
    return '_';
  }

  private isParamStart(): boolean {
    const t = this.peek();
    return t === TokenType.IDENT || t === TokenType.UNDERSCORE || t === TokenType.LPAREN
      || t === TokenType.LBRACKET || (t === TokenType.UPPER_IDENT && this.current().value !== 'None' && this.current().value !== 'Some');
  }

  // ── Expressions ─────────────────────────────────────────────────────────
  private parseExpr(): ASTNode {
    return this.parseSequence();
  }

  // Parse expression without consuming semicolons as sequence separators
  // Used inside lists, tuples, etc. where semicolons have different meaning
  private parseExprNoSeq(): ASTNode {
    return this.parseLowExpr();
  }

  private parseSequence(): ASTNode {
    let expr = this.parseLowExpr();

    if (this.peek() === TokenType.SEMICOLON && this.tokens[this.pos + 1]?.type !== TokenType.SEMICOLON) {
      const exprs = [expr];
      while (this.match(TokenType.SEMICOLON)) {
        if (this.peek() === TokenType.SEMICOLON || this.isAtEnd()) break;
        if (this.isExprEnd()) break;
        exprs.push(this.parseLowExpr());
      }
      if (exprs.length > 1) {
        return { kind: 'sequence', exprs, line: exprs[0].line };
      }
    }

    return expr;
  }

  private isExprEnd(): boolean {
    const t = this.peek();
    return t === TokenType.RPAREN || t === TokenType.RBRACKET || t === TokenType.END
      || t === TokenType.DONE || t === TokenType.IN || t === TokenType.WITH
      || t === TokenType.SEMISEMI || t === TokenType.EOF || t === TokenType.ELSE
      || t === TokenType.THEN;
  }

  private parseLowExpr(): ASTNode {
    const tok = this.current();

    if (tok.type === TokenType.LET) return this.parseLet(false);
    if (tok.type === TokenType.IF) return this.parseIf();
    if (tok.type === TokenType.FUN) return this.parseFun();
    if (tok.type === TokenType.FUNCTION) return this.parseFunctionMatch();
    if (tok.type === TokenType.MATCH) return this.parseMatch();
    if (tok.type === TokenType.TRY) return this.parseTryWith();
    if (tok.type === TokenType.FOR) return this.parseFor();
    if (tok.type === TokenType.WHILE) return this.parseWhile();

    return this.parseAssign();
  }

  // ── If ──────────────────────────────────────────────────────────────────
  private parseIf(): ASTNode {
    const tok = this.advance(); // if
    const cond = this.parseExpr();
    this.expect(TokenType.THEN);
    const then = this.parseExpr();
    let elseExpr: ASTNode | undefined;
    if (this.match(TokenType.ELSE)) {
      elseExpr = this.parseExpr();
    }
    return { kind: 'if', cond, then, else: elseExpr, line: tok.line };
  }

  // ── Fun ─────────────────────────────────────────────────────────────────
  private parseFun(): ASTNode {
    const tok = this.advance(); // fun
    const params: Pattern[] = [];
    while (this.peek() !== TokenType.ARROW && !this.isAtEnd()) {
      params.push(this.parseSimplePattern());
    }
    this.expect(TokenType.ARROW);
    const body = this.parseExpr();
    return { kind: 'fun', params, body, line: tok.line };
  }

  // ── Function (pattern matching shorthand) ──────────────────────────────
  private parseFunctionMatch(): ASTNode {
    const tok = this.advance(); // function
    this.match(TokenType.PIPE); // optional leading |
    const cases = this.parseMatchCases();
    // Desugar to fun _arg -> match _arg with ...
    return {
      kind: 'fun',
      params: [{ kind: 'pvar', name: '__arg' }],
      body: { kind: 'match', expr: { kind: 'var', name: '__arg', line: tok.line }, cases, line: tok.line },
      line: tok.line,
    };
  }

  // ── Match ───────────────────────────────────────────────────────────────
  private parseMatch(): ASTNode {
    const tok = this.advance(); // match
    const expr = this.parseExpr();
    this.expect(TokenType.WITH);
    this.match(TokenType.PIPE); // optional leading |
    const cases = this.parseMatchCases();
    return { kind: 'match', expr, cases, line: tok.line };
  }

  private parseMatchCases(): MatchCase[] {
    const cases: MatchCase[] = [];
    do {
      const pattern = this.parsePattern();
      let guard: ASTNode | undefined;
      if (this.peek() === TokenType.IDENT && this.current().value === 'when') {
        this.advance();
        guard = this.parseExpr();
      }
      this.expect(TokenType.ARROW);
      const body = this.parseExpr();
      cases.push({ pattern, guard, body });
    } while (this.match(TokenType.PIPE));
    return cases;
  }

  // ── Try With ────────────────────────────────────────────────────────────
  private parseTryWith(): ASTNode {
    const tok = this.advance(); // try
    const expr = this.parseExpr();
    this.expect(TokenType.WITH);
    this.match(TokenType.PIPE);
    const cases = this.parseMatchCases();
    return { kind: 'trywith', expr, cases, line: tok.line };
  }

  // ── For ─────────────────────────────────────────────────────────────────
  private parseFor(): ASTNode {
    const tok = this.advance(); // for
    const varName = this.expect(TokenType.IDENT).value;
    this.expect(TokenType.EQ);
    const start = this.parseExpr();
    const up = this.peek() === TokenType.TO;
    if (!this.match(TokenType.TO) && !this.match(TokenType.DOWNTO)) {
      throw new ParseError('Expected "to" or "downto"', this.current().line);
    }
    const end = this.parseExpr();
    this.expect(TokenType.DO);
    const body = this.parseExpr();
    this.expect(TokenType.DONE);
    return { kind: 'for', var: varName, start, end, up, body, line: tok.line };
  }

  // ── While ───────────────────────────────────────────────────────────────
  private parseWhile(): ASTNode {
    const tok = this.advance(); // while
    const cond = this.parseExpr();
    this.expect(TokenType.DO);
    const body = this.parseExpr();
    this.expect(TokenType.DONE);
    return { kind: 'while', cond, body, line: tok.line };
  }

  // ── Assignment ──────────────────────────────────────────────────────────
  private parseAssign(): ASTNode {
    let expr = this.parseOr();
    if (this.match(TokenType.COLONEQUAL)) {
      // Right side of := should not consume semicolons (sequence operators)
      const value = this.parseOr();
      return { kind: 'assign', ref: expr, value, line: expr.line };
    }
    return expr;
  }

  // ── Binary Operators (precedence climbing) ──────────────────────────────
  private parseOr(): ASTNode {
    let left = this.parseAnd();
    while (this.match(TokenType.PIPEPIPE)) {
      const right = this.parseAnd();
      left = { kind: 'binop', op: '||', left, right, line: left.line };
    }
    return left;
  }

  private parseAnd(): ASTNode {
    let left = this.parseNot();
    while (this.match(TokenType.AMPAMP)) {
      const right = this.parseNot();
      left = { kind: 'binop', op: '&&', left, right, line: left.line };
    }
    return left;
  }

  private parseNot(): ASTNode {
    if (this.peek() === TokenType.NOT) {
      const tok = this.advance();
      const expr = this.parseNot();
      return { kind: 'unary', op: 'not', expr, line: tok.line };
    }
    return this.parseComparison();
  }

  private parseComparison(): ASTNode {
    let left = this.parsePipeForward();
    const ops = [TokenType.EQ, TokenType.NEQ, TokenType.LT, TokenType.GT, TokenType.LE, TokenType.GE,
      TokenType.PHYSICAL_EQ, TokenType.PHYSICAL_NEQ];
    if (ops.includes(this.peek())) {
      const op = this.advance();
      const right = this.parsePipeForward();
      left = { kind: 'binop', op: op.value, left, right, line: left.line };
    }
    return left;
  }

  private parsePipeForward(): ASTNode {
    let left = this.parseConcat();
    while (this.match(TokenType.PIPE_GT)) {
      const right = this.parseConcat();
      left = { kind: 'app', func: right, args: [left], line: left.line };
    }
    return left;
  }

  private parseConcat(): ASTNode {
    let left = this.parseCons();
    while (true) {
      if (this.match(TokenType.AT)) {
        const right = this.parseCons();
        left = { kind: 'binop', op: '@', left, right, line: left.line };
      } else if (this.match(TokenType.CARET)) {
        const right = this.parseCons();
        left = { kind: 'binop', op: '^', left, right, line: left.line };
      } else break;
    }
    return left;
  }

  private parseCons(): ASTNode {
    const left = this.parseAdditive();
    if (this.match(TokenType.COLONCOLON)) {
      const right = this.parseCons(); // right-associative
      return { kind: 'cons', head: left, tail: right, line: left.line };
    }
    return left;
  }

  private parseAdditive(): ASTNode {
    let left = this.parseMultiplicative();
    while (true) {
      if (this.match(TokenType.PLUS)) {
        const right = this.parseMultiplicative();
        left = { kind: 'binop', op: '+', left, right, line: left.line };
      } else if (this.match(TokenType.MINUS)) {
        const right = this.parseMultiplicative();
        left = { kind: 'binop', op: '-', left, right, line: left.line };
      } else if (this.match(TokenType.PLUS_DOT)) {
        const right = this.parseMultiplicative();
        left = { kind: 'binop', op: '+.', left, right, line: left.line };
      } else if (this.match(TokenType.MINUS_DOT)) {
        const right = this.parseMultiplicative();
        left = { kind: 'binop', op: '-.', left, right, line: left.line };
      } else break;
    }
    return left;
  }

  private parseMultiplicative(): ASTNode {
    let left = this.parseUnary();
    while (true) {
      if (this.match(TokenType.STAR)) {
        const right = this.parseUnary();
        left = { kind: 'binop', op: '*', left, right, line: left.line };
      } else if (this.match(TokenType.SLASH)) {
        const right = this.parseUnary();
        left = { kind: 'binop', op: '/', left, right, line: left.line };
      } else if (this.match(TokenType.MOD)) {
        const right = this.parseUnary();
        left = { kind: 'binop', op: 'mod', left, right, line: left.line };
      } else if (this.match(TokenType.STAR_DOT)) {
        const right = this.parseUnary();
        left = { kind: 'binop', op: '*.', left, right, line: left.line };
      } else if (this.match(TokenType.SLASH_DOT)) {
        const right = this.parseUnary();
        left = { kind: 'binop', op: '/.', left, right, line: left.line };
      } else break;
    }
    return left;
  }

  private parseUnary(): ASTNode {
    if (this.peek() === TokenType.MINUS) {
      const tok = this.advance();
      const expr = this.parseUnary();
      return { kind: 'unary', op: '-', expr, line: tok.line };
    }
    if (this.peek() === TokenType.MINUS_DOT) {
      const tok = this.advance();
      const expr = this.parseUnary();
      return { kind: 'unary', op: '-.', expr, line: tok.line };
    }
    if (this.peek() === TokenType.BANG) {
      const tok = this.advance();
      const expr = this.parseApplication();
      return { kind: 'deref', expr, line: tok.line };
    }
    return this.parseApplication();
  }

  private parseApplication(): ASTNode {
    let func = this.parsePrimary();

    // Handle Printf.printf specially
    if (func.kind === 'fieldaccess' &&
        ((func as any).expr?.kind === 'constructor' && (func as any).expr?.name === 'Printf') &&
        (func as any).field === 'printf') {
      return this.parsePrintfCall(func);
    }

    // Handle module.function calls
    while (this.isAppArg()) {
      const arg = this.parsePrimary();
      func = { kind: 'app', func, args: [arg], line: func.line };
    }
    return func;
  }

  private parsePrintfCall(func: ASTNode): ASTNode {
    if (this.peek() === TokenType.STRING) {
      const fmt = this.advance().value;
      const args: ASTNode[] = [];
      while (this.isAppArg()) {
        args.push(this.parsePrimary());
      }
      return { kind: 'printf', format: fmt, args, line: func.line };
    }
    return func;
  }

  private isAppArg(): boolean {
    const t = this.peek();
    if (t === TokenType.EOF || t === TokenType.SEMISEMI || t === TokenType.SEMICOLON ||
        t === TokenType.RPAREN || t === TokenType.RBRACKET || t === TokenType.RBRACE ||
        t === TokenType.IN || t === TokenType.THEN || t === TokenType.ELSE ||
        t === TokenType.WITH || t === TokenType.END || t === TokenType.DONE ||
        t === TokenType.DO || t === TokenType.TO || t === TokenType.DOWNTO ||
        t === TokenType.PIPE || t === TokenType.ARROW ||
        t === TokenType.EQ || t === TokenType.NEQ || t === TokenType.LT || t === TokenType.GT ||
        t === TokenType.LE || t === TokenType.GE || t === TokenType.PHYSICAL_EQ || t === TokenType.PHYSICAL_NEQ ||
        t === TokenType.PLUS || t === TokenType.MINUS || t === TokenType.STAR || t === TokenType.SLASH ||
        t === TokenType.PLUS_DOT || t === TokenType.MINUS_DOT || t === TokenType.STAR_DOT || t === TokenType.SLASH_DOT ||
        t === TokenType.MOD || t === TokenType.AMPAMP || t === TokenType.PIPEPIPE ||
        t === TokenType.COLONCOLON || t === TokenType.AT || t === TokenType.CARET ||
        t === TokenType.COLONEQUAL || t === TokenType.PIPE_GT ||
        t === TokenType.COMMA || t === TokenType.COLON ||
        t === TokenType.AND ||
        t === TokenType.LET || t === TokenType.IF || t === TokenType.MATCH || t === TokenType.FUN ||
        t === TokenType.FUNCTION || t === TokenType.TRY || t === TokenType.FOR || t === TokenType.WHILE ||
        t === TokenType.TYPE || t === TokenType.EXCEPTION || t === TokenType.OPEN) {
      return false;
    }
    return true;
  }

  // ── Primary Expressions ─────────────────────────────────────────────────
  private parsePrimary(): ASTNode {
    const tok = this.current();

    // Literals
    if (tok.type === TokenType.INT) {
      this.advance();
      return { kind: 'literal', type: 'int', value: parseInt(tok.value), line: tok.line };
    }
    if (tok.type === TokenType.FLOAT) {
      this.advance();
      return { kind: 'literal', type: 'float', value: parseFloat(tok.value), line: tok.line };
    }
    if (tok.type === TokenType.STRING) {
      this.advance();
      return { kind: 'literal', type: 'string', value: tok.value, line: tok.line };
    }
    if (tok.type === TokenType.CHAR) {
      this.advance();
      return { kind: 'literal', type: 'char', value: tok.value, line: tok.line };
    }
    if (tok.type === TokenType.TRUE) {
      this.advance();
      return { kind: 'literal', type: 'bool', value: true, line: tok.line };
    }
    if (tok.type === TokenType.FALSE) {
      this.advance();
      return { kind: 'literal', type: 'bool', value: false, line: tok.line };
    }

    // Unit ()
    if (tok.type === TokenType.IDENT && tok.value === '()') {
      this.advance();
      return { kind: 'unit', line: tok.line };
    }

    // Identifiers
    if (tok.type === TokenType.IDENT) {
      this.advance();
      let node: ASTNode = { kind: 'var', name: tok.value, line: tok.line };

      // Handle record field access: expr.field
      while (this.match(TokenType.DOT)) {
        if (this.peek() === TokenType.IDENT) {
          const field = this.advance().value;
          node = { kind: 'fieldaccess', expr: node, field, line: tok.line };
        } else if (this.peek() === TokenType.LPAREN) {
          // array access: arr.(idx)
          this.advance(); // (
          const idx = this.parseExpr();
          this.expect(TokenType.RPAREN);
          if (this.peek() === TokenType.LT && this.tokens[this.pos + 1]?.type === TokenType.MINUS) {
            this.advance(); // <
            this.advance(); // -
            const value = this.parseExpr();
            node = { kind: 'arrayset', array: node, index: idx, value, line: tok.line };
          } else {
            node = { kind: 'arrayaccess', array: node, index: idx, line: tok.line };
          }
        } else break;
      }
      return node;
    }

    // ref
    if (tok.type === TokenType.REF) {
      this.advance();
      const expr = this.parsePrimary();
      return { kind: 'ref', expr, line: tok.line };
    }

    // raise
    if (tok.type === TokenType.RAISE) {
      this.advance();
      const expr = this.parsePrimary();
      return { kind: 'raise', expr, line: tok.line };
    }

    // Constructor (upper case ident)
    if (tok.type === TokenType.UPPER_IDENT) {
      this.advance();
      let name = tok.value;

      // Module access: Module.something
      if (this.match(TokenType.DOT)) {
        if (this.peek() === TokenType.IDENT) {
          const field = this.advance().value;
          let node: ASTNode = { kind: 'fieldaccess', expr: { kind: 'constructor', name, line: tok.line }, field, line: tok.line };

          // Handle Printf.printf "fmt" args...
          if (name === 'Printf' && field === 'printf' && this.peek() === TokenType.STRING) {
            const fmt = this.advance().value;
            const args: ASTNode[] = [];
            while (this.isAppArg()) {
              args.push(this.parsePrimary());
            }
            return { kind: 'printf', format: fmt, args, line: tok.line };
          }

          return node;
        } else if (this.peek() === TokenType.UPPER_IDENT) {
          name = name + '.' + this.advance().value;
          return { kind: 'constructor', name, line: tok.line };
        }
      }

      // Constructor with argument
      if (this.isAppArg()) {
        const arg = this.parsePrimary();
        return { kind: 'constructor', name, arg, line: tok.line };
      }

      return { kind: 'constructor', name, line: tok.line };
    }

    // Parenthesized / Tuple
    if (tok.type === TokenType.LPAREN) {
      this.advance();
      if (this.match(TokenType.RPAREN)) {
        return { kind: 'unit', line: tok.line };
      }
      const expr = this.parseExpr();
      if (this.peek() === TokenType.COMMA) {
        const elements = [expr];
        while (this.match(TokenType.COMMA)) {
          elements.push(this.parseExpr());
        }
        this.expect(TokenType.RPAREN);
        return { kind: 'tuple', elements, line: tok.line };
      }
      // Type annotation inside parens: ignore
      if (this.match(TokenType.COLON)) {
        this.parseTypeAnnotation();
      }
      this.expect(TokenType.RPAREN);
      return expr;
    }

    // List
    if (tok.type === TokenType.LBRACKET) {
      this.advance();
      if (tok.value === '[]') {
        return { kind: 'list', elements: [], line: tok.line };
      }
      if (tok.value === '[|') {
        // Array literal
        const elements: ASTNode[] = [];
        if (this.peek() !== TokenType.RBRACKET) {
          elements.push(this.parseExprNoSeq());
          while (this.match(TokenType.SEMICOLON)) {
            if (this.peek() === TokenType.RBRACKET) break;
            elements.push(this.parseExprNoSeq());
          }
        }
        this.expect(TokenType.RBRACKET); // |]
        return { kind: 'array', elements, line: tok.line };
      }
      const elements: ASTNode[] = [];
      if (this.peek() !== TokenType.RBRACKET) {
        elements.push(this.parseExprNoSeq());
        while (this.match(TokenType.SEMICOLON)) {
          if (this.peek() === TokenType.RBRACKET) break;
          elements.push(this.parseExprNoSeq());
        }
      }
      this.expect(TokenType.RBRACKET);
      return { kind: 'list', elements, line: tok.line };
    }

    // Record literal { field = value; ... }
    if (tok.type === TokenType.LBRACE) {
      this.advance();
      const fields: { name: string; value: ASTNode }[] = [];
      while (this.peek() !== TokenType.RBRACE && !this.isAtEnd()) {
        const name = this.expect(TokenType.IDENT).value;
        this.expect(TokenType.EQ);
        const value = this.parseExprNoSeq();
        fields.push({ name, value });
        this.match(TokenType.SEMICOLON);
      }
      this.expect(TokenType.RBRACE);
      return { kind: 'record', fields, line: tok.line };
    }

    // Begin...end
    if (tok.type === TokenType.BEGIN) {
      this.advance();
      const expr = this.parseExpr();
      this.expect(TokenType.END);
      return { kind: 'begin', expr, line: tok.line };
    }

    // Underscore as wildcard variable
    if (tok.type === TokenType.UNDERSCORE) {
      this.advance();
      return { kind: 'var', name: '_', line: tok.line };
    }

    throw new ParseError(`Unexpected token: ${tok.type} '${tok.value}'`, tok.line, tok.column);
  }

  // ── Patterns ────────────────────────────────────────────────────────────
  private parsePattern(): Pattern {
    let pat = this.parseConsPattern();
    if (this.peek() === TokenType.PIPE && this.tokens[this.pos + 1]?.type !== TokenType.RBRACKET) {
      // Check if this is an or-pattern (not a new match case)
      // This is tricky - for now, don't handle or-patterns in simple cases
    }
    return pat;
  }

  private parseConsPattern(): Pattern {
    let pat = this.parseTuplePattern();
    if (this.match(TokenType.COLONCOLON)) {
      const tail = this.parseConsPattern();
      return { kind: 'pcons', head: pat, tail };
    }
    return pat;
  }

  private parseTuplePattern(): Pattern {
    let pat = this.parseSimplePattern();
    if (this.peek() === TokenType.COMMA) {
      const elements = [pat];
      while (this.match(TokenType.COMMA)) {
        elements.push(this.parseSimplePattern());
      }
      return { kind: 'ptuple', elements };
    }
    return pat;
  }

  parseSimplePattern(): Pattern {
    const tok = this.current();

    if (tok.type === TokenType.UNDERSCORE) {
      this.advance();
      return { kind: 'pwild' };
    }

    if (tok.type === TokenType.INT) {
      this.advance();
      return { kind: 'pliteral', type: 'int', value: parseInt(tok.value) };
    }

    if (tok.type === TokenType.FLOAT) {
      this.advance();
      return { kind: 'pliteral', type: 'float', value: parseFloat(tok.value) };
    }

    if (tok.type === TokenType.STRING) {
      this.advance();
      return { kind: 'pliteral', type: 'string', value: tok.value };
    }

    if (tok.type === TokenType.CHAR) {
      this.advance();
      return { kind: 'pliteral', type: 'char', value: tok.value };
    }

    if (tok.type === TokenType.TRUE) {
      this.advance();
      return { kind: 'pliteral', type: 'bool', value: true };
    }

    if (tok.type === TokenType.FALSE) {
      this.advance();
      return { kind: 'pliteral', type: 'bool', value: false };
    }

    if (tok.type === TokenType.IDENT) {
      if (tok.value === '()') {
        this.advance();
        return { kind: 'punit' };
      }
      this.advance();
      return { kind: 'pvar', name: tok.value };
    }

    if (tok.type === TokenType.UPPER_IDENT) {
      this.advance();
      // Constructor pattern
      if (this.isAppArg() || this.peek() === TokenType.LPAREN) {
        const arg = this.parseSimplePattern();
        return { kind: 'pconstructor', name: tok.value, arg };
      }
      return { kind: 'pconstructor', name: tok.value };
    }

    if (tok.type === TokenType.LPAREN) {
      this.advance();
      if (this.match(TokenType.RPAREN)) {
        return { kind: 'punit' };
      }
      const pat = this.parsePattern();
      // Handle type annotation in pattern
      if (this.match(TokenType.COLON)) {
        this.parseTypeAnnotation();
      }
      this.expect(TokenType.RPAREN);
      return pat;
    }

    if (tok.type === TokenType.LBRACKET) {
      this.advance();
      if (tok.value === '[]') {
        return { kind: 'plist', elements: [] };
      }
      const elements: Pattern[] = [];
      if (this.peek() !== TokenType.RBRACKET) {
        elements.push(this.parsePattern());
        while (this.match(TokenType.SEMICOLON)) {
          if (this.peek() === TokenType.RBRACKET) break;
          elements.push(this.parsePattern());
        }
      }
      this.expect(TokenType.RBRACKET);
      return { kind: 'plist', elements };
    }

    throw new ParseError(`Unexpected token in pattern: ${tok.type} '${tok.value}'`, tok.line, tok.column);
  }
}
