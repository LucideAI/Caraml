import {
  ASTNode, Value, Environment, Pattern,
  VInt, VFloat, VString, VBool, VUnit, VList, VTuple, VFun, VRecFun, VRef, VConstructor, VBuiltin, VRecord, VArray,
  RuntimeError, MatchFailure, OCamlError,
} from './types';
import type { MemoryState, StackFrame as StackFrameType, VariableInfo, HeapObject } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// OCaml Evaluator
// ═══════════════════════════════════════════════════════════════════════════

export class Evaluator {
  private env: Environment;
  private output: string[] = [];
  private callStack: { name: string; line: number; env: Environment }[] = [];
  private heapObjects: { id: number; type: string; value: string; refCount: number }[] = [];
  private nextHeapId = 1;
  private typeDefinitions: Map<string, { params: string[]; variants: { name: string; type?: string }[] }> = new Map();
  private exceptionTypes: Map<string, string | undefined> = new Map();
  private stepCount = 0;
  private maxSteps = 1_000_000;
  private recursionDepth = 0;
  private maxRecursionDepth = 5_000;
  private startTime = 0;
  private maxExecutionTimeMs = 10_000; // 10 seconds wall-clock limit
  private declaredValues: { name: string; type: string; value: string }[] = [];

  constructor() {
    this.env = new Environment(null, 'global');
    this.installStdlib();
  }

  evaluate(nodes: ASTNode[]): { output: string; values: { name: string; type: string; value: string }[]; memoryState: MemoryState; errors: any[] } {
    this.output = [];
    this.declaredValues = [];
    this.heapObjects = [];
    this.nextHeapId = 1;
    this.callStack = [{ name: 'toplevel', line: 0, env: this.env }];
    this.stepCount = 0;
    this.recursionDepth = 0;
    this.startTime = Date.now();

    const errors: any[] = [];

    for (const node of nodes) {
      try {
        const result = this.eval(node, this.env);

        // Record top-level declarations
        if (node.kind === 'let' || node.kind === 'letrec') {
          const name = (node as any).name;
          if (name && name !== '_' && name !== '()') {
            // For mutable types (ref), we'll update the display at the end
            this.declaredValues.push({ name, type: '', value: '' });
          }
        } else if (node.kind === 'typedecl') {
          const td = node as any;
          this.declaredValues.push({ name: td.name, type: 'type', value: this.formatTypeDecl(td) });
        } else if (node.kind === 'exceptiondecl') {
          const ed = node as any;
          this.declaredValues.push({ name: ed.name, type: 'exception', value: ed.type ? `exception ${ed.name} of ${ed.type}` : `exception ${ed.name}` });
        } else if (node.kind !== 'open') {
          // Anonymous expression result
          if (result.tag !== 'unit') {
            const type = this.inferType(result);
            const display = this.displayValue(result);
            this.declaredValues.push({ name: '-', type, value: display });
          }
        }
      } catch (e: any) {
        if (e instanceof OCamlError) {
          errors.push({ line: e.line, column: e.column, message: `${e.kind}: ${e.message}` });
          this.output.push(`${e.kind}: ${e.message}`);
        } else {
          errors.push({ line: 0, column: 0, message: e.message || String(e) });
          this.output.push(`Error: ${e.message || String(e)}`);
        }
        break;
      }
    }

    // Refresh declared values to get final state (important for refs)
    const finalValues = this.declaredValues.map(dv => {
      if (dv.type === 'type' || dv.type === 'exception' || dv.name === '-') return dv;
      const val = this.env.get(dv.name);
      if (val) {
        return { name: dv.name, type: this.inferType(val), value: this.displayValue(val) };
      }
      return dv;
    });

    return {
      output: this.output.join(''),
      values: finalValues,
      memoryState: this.getMemoryState(),
      errors,
    };
  }

  private formatTypeDecl(td: any): string {
    if (td.variants.length === 0) return `type ${td.name}`;
    if (td.variants[0].name.startsWith('{')) return `type ${td.name} = ${td.variants[0].name}`;
    return `type ${td.name} = ${td.variants.map((v: any) => v.type ? `${v.name} of ${v.type}` : v.name).join(' | ')}`;
  }

  // ── Core Evaluation ─────────────────────────────────────────────────────
  private eval(node: ASTNode, env: Environment): Value {
    this.stepCount++;
    if (this.stepCount > this.maxSteps) {
      throw new RuntimeError('Maximum execution steps exceeded (possible infinite loop)', node.line);
    }
    // Check time limit every 1000 steps (avoid calling Date.now too often)
    if (this.stepCount % 1000 === 0 && Date.now() - this.startTime > this.maxExecutionTimeMs) {
      throw new RuntimeError(`Execution time limit exceeded (${this.maxExecutionTimeMs / 1000}s)`, node.line);
    }

    switch (node.kind) {
      case 'literal': return this.evalLiteral(node);
      case 'unit': return { tag: 'unit' };
      case 'var': return this.evalVar(node, env);
      case 'let': return this.evalLet(node, env);
      case 'letrec': return this.evalLetRec(node, env);
      case 'fun': return this.evalFun(node, env);
      case 'app': return this.evalApp(node, env);
      case 'binop': return this.evalBinOp(node, env);
      case 'unary': return this.evalUnary(node, env);
      case 'if': return this.evalIf(node, env);
      case 'match': return this.evalMatch(node, env);
      case 'tuple': return this.evalTuple(node, env);
      case 'list': return this.evalList(node, env);
      case 'cons': return this.evalCons(node, env);
      case 'sequence': return this.evalSequence(node, env);
      case 'ref': return this.evalRef(node, env);
      case 'deref': return this.evalDeref(node, env);
      case 'assign': return this.evalAssign(node, env);
      case 'constructor': return this.evalConstructor(node, env);
      case 'typedecl': return this.evalTypeDecl(node); // returns unit
      case 'exceptiondecl': return this.evalExceptionDecl(node);
      case 'raise': return this.evalRaise(node, env);
      case 'trywith': return this.evalTryWith(node, env);
      case 'begin': return this.eval((node as any).expr, env);
      case 'record': return this.evalRecord(node, env);
      case 'fieldaccess': return this.evalFieldAccess(node, env);
      case 'for': return this.evalFor(node, env);
      case 'while': return this.evalWhile(node, env);
      case 'array': return this.evalArray(node, env);
      case 'arrayaccess': return this.evalArrayAccess(node, env);
      case 'arrayset': return this.evalArraySet(node, env);
      case 'open': return { tag: 'unit' };
      case 'printf': return this.evalPrintf(node, env);
      default:
        throw new RuntimeError(`Unknown node kind: ${(node as any).kind}`, (node as any).line);
    }
  }

  private evalLiteral(node: any): Value {
    switch (node.type) {
      case 'int': return { tag: 'int', value: node.value };
      case 'float': return { tag: 'float', value: node.value };
      case 'string': return { tag: 'string', value: node.value };
      case 'char': return { tag: 'char', value: node.value };
      case 'bool': return { tag: 'bool', value: node.value };
      default: return { tag: 'unit' };
    }
  }

  private evalVar(node: any, env: Environment): Value {
    if (node.name === '_') return { tag: 'unit' };
    const val = env.get(node.name);
    if (val === undefined) {
      throw new RuntimeError(`Unbound value ${node.name}`, node.line);
    }
    return val;
  }

  private evalLet(node: any, env: Environment): Value {
    const bodyVal = node.params.length > 0
      ? this.makeFun(node.params, node.body, env)
      : this.eval(node.body, env);

    if (node.inExpr) {
      const newEnv = env.extend('let');
      if (node.name !== '()' && node.name !== '_') {
        newEnv.set(node.name, bodyVal);
      }
      return this.eval(node.inExpr, newEnv);
    }

    // Top-level binding
    if (node.name === '()') {
      // let () = expr → evaluate for side effects
      return bodyVal;
    }
    if (node.name !== '_') {
      env.set(node.name, bodyVal);
    }
    return bodyVal;
  }

  private evalLetRec(node: any, env: Environment): Value {
    if (node.params.length > 0) {
      const recFun: VRecFun = { tag: 'recfun', name: node.name, params: node.params, body: node.body, env };
      if (node.inExpr) {
        const newEnv = env.extend('letrec');
        newEnv.set(node.name, recFun);
        recFun.env = newEnv;
        return this.eval(node.inExpr, newEnv);
      }
      env.set(node.name, recFun);
      recFun.env = env;
      return recFun;
    }

    // Non-function let rec (e.g., let rec x = lazy evaluation — just evaluate normally)
    const val = this.eval(node.body, env);
    if (node.inExpr) {
      const newEnv = env.extend('letrec');
      newEnv.set(node.name, val);
      return this.eval(node.inExpr, newEnv);
    }
    env.set(node.name, val);
    return val;
  }

  private evalFun(node: any, env: Environment): Value {
    return { tag: 'fun', params: node.params, body: node.body, env };
  }

  private makeFun(params: Pattern[], body: ASTNode, env: Environment): Value {
    return { tag: 'fun', params, body, env };
  }

  private evalApp(node: any, env: Environment): Value {
    const func = this.eval(node.func, env);
    const args = node.args.map((a: ASTNode) => this.eval(a, env));

    return this.applyFunction(func, args, node.line);
  }

  private applyFunction(func: Value, args: Value[], line: number): Value {
    for (const arg of args) {
      func = this.applyOne(func, arg, line);
    }
    return func;
  }

  private applyOne(func: Value, arg: Value, line: number): Value {
    if (func.tag === 'fun') {
      const newEnv = func.env.extend('fn');
      this.bindPattern(func.params[0], arg, newEnv, line);
      if (func.params.length > 1) {
        return { tag: 'fun', params: func.params.slice(1), body: func.body, env: newEnv };
      }
      this.recursionDepth++;
      if (this.recursionDepth > this.maxRecursionDepth) {
        throw new RuntimeError(`Maximum recursion depth exceeded (${this.maxRecursionDepth})`, line);
      }
      this.callStack.push({ name: 'lambda', line, env: newEnv });
      const result = this.eval(func.body, newEnv);
      this.callStack.pop();
      this.recursionDepth--;
      return result;
    }

    if (func.tag === 'recfun') {
      const newEnv = func.env.extend(func.name);
      newEnv.set(func.name, func);
      this.bindPattern(func.params[0], arg, newEnv, line);
      if (func.params.length > 1) {
        return { tag: 'fun', params: func.params.slice(1), body: func.body, env: newEnv };
      }
      this.recursionDepth++;
      if (this.recursionDepth > this.maxRecursionDepth) {
        throw new RuntimeError(`Maximum recursion depth exceeded (${this.maxRecursionDepth})`, line);
      }
      this.callStack.push({ name: func.name, line, env: newEnv });
      const result = this.eval(func.body, newEnv);
      this.callStack.pop();
      this.recursionDepth--;
      return result;
    }

    if (func.tag === 'builtin') {
      const applied = [...func.applied, arg];
      if (applied.length >= func.arity) {
        return func.fn(applied);
      }
      return { ...func, applied };
    }

    if (func.tag === 'constructor') {
      return { tag: 'constructor', name: func.name, value: arg };
    }

    throw new RuntimeError(`Trying to apply a non-function value: ${this.displayValue(func)}`, line);
  }

  // ── Pattern Matching ────────────────────────────────────────────────────
  private bindPattern(pat: Pattern, val: Value, env: Environment, line: number): void {
    if (!this.matchPattern(pat, val, env)) {
      throw new MatchFailure(line);
    }
  }

  private matchPattern(pat: Pattern, val: Value, env: Environment): boolean {
    switch (pat.kind) {
      case 'pwild': return true;
      case 'punit': return val.tag === 'unit';
      case 'pvar':
        env.set(pat.name, val);
        return true;
      case 'pliteral':
        if (pat.type === 'int' && val.tag === 'int') return val.value === pat.value;
        if (pat.type === 'float' && val.tag === 'float') return val.value === pat.value;
        if (pat.type === 'string' && val.tag === 'string') return val.value === pat.value;
        if (pat.type === 'char' && val.tag === 'char') return val.value === pat.value;
        if (pat.type === 'bool' && val.tag === 'bool') return val.value === pat.value;
        return false;
      case 'ptuple':
        if (val.tag !== 'tuple' || val.elements.length !== pat.elements.length) return false;
        return pat.elements.every((p, i) => this.matchPattern(p, val.elements[i], env));
      case 'plist':
        if (val.tag !== 'list') return false;
        if (val.elements.length !== pat.elements.length) return false;
        return pat.elements.every((p, i) => this.matchPattern(p, val.elements[i], env));
      case 'pcons':
        if (val.tag !== 'list' || val.elements.length === 0) return false;
        return this.matchPattern(pat.head, val.elements[0], env) &&
               this.matchPattern(pat.tail, { tag: 'list', elements: val.elements.slice(1) }, env);
      case 'pconstructor':
        if (val.tag !== 'constructor') return false;
        if (val.name !== pat.name) return false;
        if (pat.arg) {
          if (val.value === undefined) return false;
          return this.matchPattern(pat.arg, val.value, env);
        }
        return val.value === undefined;
      case 'por':
        const envCopy = env.extend();
        if (this.matchPattern(pat.left, val, envCopy)) {
          for (const [k, v] of envCopy.bindings) env.set(k, v);
          return true;
        }
        return this.matchPattern(pat.right, val, env);
      default:
        return false;
    }
  }

  private evalMatch(node: any, env: Environment): Value {
    const val = this.eval(node.expr, env);
    for (const c of node.cases) {
      const matchEnv = env.extend('match');
      if (this.matchPattern(c.pattern, val, matchEnv)) {
        if (c.guard) {
          const guardVal = this.eval(c.guard, matchEnv);
          if (guardVal.tag !== 'bool' || !guardVal.value) continue;
        }
        return this.eval(c.body, matchEnv);
      }
    }
    throw new MatchFailure(node.line);
  }

  // ── Binary Operations ───────────────────────────────────────────────────
  private evalBinOp(node: any, env: Environment): Value {
    const left = this.eval(node.left, env);

    // Short-circuit for logical operators
    if (node.op === '&&') {
      if (left.tag === 'bool' && !left.value) return { tag: 'bool', value: false };
      const right = this.eval(node.right, env);
      if (right.tag !== 'bool') throw new RuntimeError('Expected bool', node.line);
      return right;
    }
    if (node.op === '||') {
      if (left.tag === 'bool' && left.value) return { tag: 'bool', value: true };
      const right = this.eval(node.right, env);
      if (right.tag !== 'bool') throw new RuntimeError('Expected bool', node.line);
      return right;
    }

    const right = this.eval(node.right, env);

    // Integer arithmetic
    if (node.op === '+' && left.tag === 'int' && right.tag === 'int')
      return { tag: 'int', value: left.value + right.value };
    if (node.op === '-' && left.tag === 'int' && right.tag === 'int')
      return { tag: 'int', value: left.value - right.value };
    if (node.op === '*' && left.tag === 'int' && right.tag === 'int')
      return { tag: 'int', value: left.value * right.value };
    if (node.op === '/' && left.tag === 'int' && right.tag === 'int') {
      if (right.value === 0) throw new RuntimeError('Division by zero', node.line);
      return { tag: 'int', value: Math.trunc(left.value / right.value) };
    }
    if (node.op === 'mod' && left.tag === 'int' && right.tag === 'int') {
      if (right.value === 0) throw new RuntimeError('Division by zero', node.line);
      return { tag: 'int', value: left.value % right.value };
    }

    // Float arithmetic
    if (node.op === '+.' && left.tag === 'float' && right.tag === 'float')
      return { tag: 'float', value: left.value + right.value };
    if (node.op === '-.' && left.tag === 'float' && right.tag === 'float')
      return { tag: 'float', value: left.value - right.value };
    if (node.op === '*.' && left.tag === 'float' && right.tag === 'float')
      return { tag: 'float', value: left.value * right.value };
    if (node.op === '/.' && left.tag === 'float' && right.tag === 'float')
      return { tag: 'float', value: left.value / right.value };

    // String concatenation
    if (node.op === '^' && left.tag === 'string' && right.tag === 'string')
      return { tag: 'string', value: left.value + right.value };

    // List append
    if (node.op === '@' && left.tag === 'list' && right.tag === 'list')
      return { tag: 'list', elements: [...left.elements, ...right.elements] };

    // Comparison (polymorphic)
    if (['=', '<>', '<', '>', '<=', '>=', '==', '!='].includes(node.op)) {
      return this.evalComparison(node.op, left, right);
    }

    throw new RuntimeError(`Invalid operation: ${this.inferType(left)} ${node.op} ${this.inferType(right)}`, node.line);
  }

  private evalComparison(op: string, left: Value, right: Value): VBool {
    const cmp = this.compareValues(left, right);
    switch (op) {
      case '=': case '==': return { tag: 'bool', value: cmp === 0 };
      case '<>': case '!=': return { tag: 'bool', value: cmp !== 0 };
      case '<': return { tag: 'bool', value: cmp < 0 };
      case '>': return { tag: 'bool', value: cmp > 0 };
      case '<=': return { tag: 'bool', value: cmp <= 0 };
      case '>=': return { tag: 'bool', value: cmp >= 0 };
      default: return { tag: 'bool', value: false };
    }
  }

  private compareValues(a: Value, b: Value): number {
    if (a.tag === 'int' && b.tag === 'int') return a.value - b.value;
    if (a.tag === 'float' && b.tag === 'float') return a.value - b.value;
    if (a.tag === 'string' && b.tag === 'string') return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
    if (a.tag === 'char' && b.tag === 'char') return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
    if (a.tag === 'bool' && b.tag === 'bool') return (a.value ? 1 : 0) - (b.value ? 1 : 0);
    if (a.tag === 'unit' && b.tag === 'unit') return 0;
    if (a.tag === 'list' && b.tag === 'list') {
      for (let i = 0; i < Math.min(a.elements.length, b.elements.length); i++) {
        const c = this.compareValues(a.elements[i], b.elements[i]);
        if (c !== 0) return c;
      }
      return a.elements.length - b.elements.length;
    }
    if (a.tag === 'tuple' && b.tag === 'tuple') {
      for (let i = 0; i < Math.min(a.elements.length, b.elements.length); i++) {
        const c = this.compareValues(a.elements[i], b.elements[i]);
        if (c !== 0) return c;
      }
      return 0;
    }
    if (a.tag === 'constructor' && b.tag === 'constructor') {
      if (a.name !== b.name) return a.name < b.name ? -1 : 1;
      if (a.value && b.value) return this.compareValues(a.value, b.value);
      return 0;
    }
    return 0;
  }

  private evalUnary(node: any, env: Environment): Value {
    const val = this.eval(node.expr, env);
    if (node.op === '-' && val.tag === 'int') return { tag: 'int', value: -val.value };
    if (node.op === '-' && val.tag === 'float') return { tag: 'float', value: -val.value };
    if (node.op === '-.' && val.tag === 'float') return { tag: 'float', value: -val.value };
    if (node.op === 'not' && val.tag === 'bool') return { tag: 'bool', value: !val.value };
    throw new RuntimeError(`Invalid unary operation: ${node.op} on ${val.tag}`, node.line);
  }

  private evalIf(node: any, env: Environment): Value {
    const cond = this.eval(node.cond, env);
    if (cond.tag !== 'bool') throw new RuntimeError('Condition must be boolean', node.line);
    if (cond.value) return this.eval(node.then, env);
    if (node.else) return this.eval(node.else, env);
    return { tag: 'unit' };
  }

  private evalTuple(node: any, env: Environment): Value {
    return { tag: 'tuple', elements: node.elements.map((e: ASTNode) => this.eval(e, env)) };
  }

  private evalList(node: any, env: Environment): Value {
    return { tag: 'list', elements: node.elements.map((e: ASTNode) => this.eval(e, env)) };
  }

  private evalCons(node: any, env: Environment): Value {
    const head = this.eval(node.head, env);
    const tail = this.eval(node.tail, env);
    if (tail.tag !== 'list') throw new RuntimeError(':: expects a list as second argument', node.line);
    return { tag: 'list', elements: [head, ...tail.elements] };
  }

  private evalSequence(node: any, env: Environment): Value {
    let result: Value = { tag: 'unit' };
    for (const expr of node.exprs) {
      result = this.eval(expr, env);
    }
    return result;
  }

  private evalRef(node: any, env: Environment): Value {
    const val = this.eval(node.expr, env);
    const id = this.nextHeapId++;
    const ref: VRef = { tag: 'ref', value: val, id };
    this.heapObjects.push({ id, type: `${this.inferType(val)} ref`, value: this.displayValue(val), refCount: 1 });
    return ref;
  }

  private evalDeref(node: any, env: Environment): Value {
    const ref = this.eval(node.expr, env);
    if (ref.tag !== 'ref') throw new RuntimeError('! expects a reference', node.line);
    return ref.value;
  }

  private evalAssign(node: any, env: Environment): Value {
    const ref = this.eval(node.ref, env);
    const val = this.eval(node.value, env);
    if (ref.tag !== 'ref') throw new RuntimeError(':= expects a reference', node.line);
    ref.value = val;
    // Update heap display
    const heapObj = this.heapObjects.find(h => h.id === ref.id);
    if (heapObj) {
      heapObj.value = this.displayValue(val);
      heapObj.type = `${this.inferType(val)} ref`;
    }
    return { tag: 'unit' };
  }

  private evalConstructor(node: any, env: Environment): Value {
    if (node.arg) {
      const arg = this.eval(node.arg, env);
      return { tag: 'constructor', name: node.name, value: arg };
    }
    return { tag: 'constructor', name: node.name };
  }

  private evalTypeDecl(node: any): Value {
    this.typeDefinitions.set(node.name, { params: node.params, variants: node.variants });
    // Register constructors in environment
    for (const v of node.variants) {
      if (/^[A-Z]/.test(v.name)) {
        if (v.type) {
          // Constructor with argument
          this.env.set(v.name, { tag: 'constructor', name: v.name } as VConstructor);
        } else {
          // Constructor without argument
          this.env.set(v.name, { tag: 'constructor', name: v.name } as VConstructor);
        }
      }
    }
    return { tag: 'unit' };
  }

  private evalExceptionDecl(node: any): Value {
    this.exceptionTypes.set(node.name, node.type);
    this.env.set(node.name, { tag: 'constructor', name: node.name } as VConstructor);
    return { tag: 'unit' };
  }

  private evalRaise(node: any, env: Environment): never {
    const val = this.eval(node.expr, env);
    throw new OCamlException(val, node.line);
  }

  private evalTryWith(node: any, env: Environment): Value {
    try {
      return this.eval(node.expr, env);
    } catch (e) {
      if (e instanceof OCamlException) {
        for (const c of node.cases) {
          const matchEnv = env.extend('catch');
          if (this.matchPattern(c.pattern, e.value, matchEnv)) {
            return this.eval(c.body, matchEnv);
          }
        }
        throw e; // Re-throw if no match
      }
      throw e;
    }
  }

  private evalRecord(node: any, env: Environment): Value {
    const fields = new Map<string, Value>();
    for (const f of node.fields) {
      fields.set(f.name, this.eval(f.value, env));
    }
    return { tag: 'record', fields };
  }

  private evalFieldAccess(node: any, env: Environment): Value {
    const obj = this.eval(node.expr, env);

    // Module access
    if (obj.tag === 'constructor') {
      const fullName = obj.name + '.' + node.field;
      const val = env.get(fullName);
      if (val) return val;

      // Handle module functions
      return this.resolveModuleAccess(obj.name, node.field, node.line);
    }

    if (obj.tag === 'record') {
      const val = obj.fields.get(node.field);
      if (val === undefined) throw new RuntimeError(`Unknown field ${node.field}`, node.line);
      return val;
    }

    throw new RuntimeError(`Cannot access field ${node.field}`, node.line);
  }

  private evalFor(node: any, env: Environment): Value {
    const start = this.eval(node.start, env);
    const end = this.eval(node.end, env);
    if (start.tag !== 'int' || end.tag !== 'int') throw new RuntimeError('For loop bounds must be integers', node.line);

    const forEnv = env.extend('for');
    if (node.up) {
      for (let i = start.value; i <= end.value; i++) {
        forEnv.set(node.var, { tag: 'int', value: i });
        this.eval(node.body, forEnv);
      }
    } else {
      for (let i = start.value; i >= end.value; i--) {
        forEnv.set(node.var, { tag: 'int', value: i });
        this.eval(node.body, forEnv);
      }
    }
    return { tag: 'unit' };
  }

  private evalWhile(node: any, env: Environment): Value {
    while (true) {
      const cond = this.eval(node.cond, env);
      if (cond.tag !== 'bool') throw new RuntimeError('While condition must be boolean', node.line);
      if (!cond.value) break;
      this.eval(node.body, env);
    }
    return { tag: 'unit' };
  }

  private evalArray(node: any, env: Environment): Value {
    const elements = node.elements.map((e: ASTNode) => this.eval(e, env));
    const id = this.nextHeapId++;
    this.heapObjects.push({ id, type: 'array', value: `[|${elements.map((e: Value) => this.displayValue(e)).join('; ')}|]`, refCount: 1 });
    return { tag: 'array', elements, id };
  }

  private evalArrayAccess(node: any, env: Environment): Value {
    const arr = this.eval(node.array, env);
    const idx = this.eval(node.index, env);
    if (arr.tag !== 'array') throw new RuntimeError('Array access on non-array', node.line);
    if (idx.tag !== 'int') throw new RuntimeError('Array index must be integer', node.line);
    if (idx.value < 0 || idx.value >= arr.elements.length)
      throw new RuntimeError(`Index out of bounds: ${idx.value}`, node.line);
    return arr.elements[idx.value];
  }

  private evalArraySet(node: any, env: Environment): Value {
    const arr = this.eval(node.array, env);
    const idx = this.eval(node.index, env);
    const val = this.eval(node.value, env);
    if (arr.tag !== 'array') throw new RuntimeError('Array set on non-array', node.line);
    if (idx.tag !== 'int') throw new RuntimeError('Array index must be integer', node.line);
    if (idx.value < 0 || idx.value >= arr.elements.length)
      throw new RuntimeError(`Index out of bounds: ${idx.value}`, node.line);
    arr.elements[idx.value] = val;
    return { tag: 'unit' };
  }

  // ── Printf ──────────────────────────────────────────────────────────────
  private evalPrintf(node: any, env: Environment): Value {
    const fmt = node.format;
    const args = node.args.map((a: ASTNode) => this.eval(a, env));
    let result = '';
    let argIdx = 0;

    let i = 0;
    while (i < fmt.length) {
      if (fmt[i] === '%' && i + 1 < fmt.length) {
        i++;
        const spec = fmt[i];
        switch (spec) {
          case 'd': case 'i':
            result += argIdx < args.length && args[argIdx].tag === 'int' ? args[argIdx].value.toString() : '?';
            argIdx++;
            break;
          case 'f':
            result += argIdx < args.length && args[argIdx].tag === 'float' ? args[argIdx].value.toString() : '?';
            argIdx++;
            break;
          case 's':
            result += argIdx < args.length && args[argIdx].tag === 'string' ? args[argIdx].value : '?';
            argIdx++;
            break;
          case 'c':
            result += argIdx < args.length && args[argIdx].tag === 'char' ? args[argIdx].value : '?';
            argIdx++;
            break;
          case 'b':
            result += argIdx < args.length && args[argIdx].tag === 'bool' ? args[argIdx].value.toString() : '?';
            argIdx++;
            break;
          case '%':
            result += '%';
            break;
          case 'n':
            result += '\n';
            break;
          default:
            result += '%' + spec;
        }
      } else {
        result += fmt[i];
      }
      i++;
    }

    this.output.push(result);
    return { tag: 'unit' };
  }

  // ── Module Access ───────────────────────────────────────────────────────
  private resolveModuleAccess(module: string, field: string, line: number): Value {
    const key = `${module}.${field}`;
    const val = this.env.get(key);
    if (val) return val;
    throw new RuntimeError(`Unbound value ${key}`, line);
  }

  // ── Type Inference (basic) ──────────────────────────────────────────────
  inferType(val: Value): string {
    switch (val.tag) {
      case 'int': return 'int';
      case 'float': return 'float';
      case 'string': return 'string';
      case 'char': return 'char';
      case 'bool': return 'bool';
      case 'unit': return 'unit';
      case 'list':
        if (val.elements.length === 0) return "'a list";
        return `${this.inferType(val.elements[0])} list`;
      case 'tuple':
        return val.elements.map(e => this.inferType(e)).join(' * ');
      case 'fun': return this.inferFunType(val);
      case 'recfun': return this.inferRecFunType(val);
      case 'ref': return `${this.inferType(val.value)} ref`;
      case 'constructor':
        if (val.value) return val.name;
        return val.name;
      case 'builtin': return this.inferBuiltinType(val);
      case 'record': return 'record';
      case 'array':
        if (val.elements.length === 0) return "'a array";
        return `${this.inferType(val.elements[0])} array`;
      default: return 'unknown';
    }
  }

  private inferFunType(val: VFun): string {
    const paramTypes = val.params.map(() => "'a");
    return paramTypes.join(' -> ') + ' -> ' + "'b";
  }

  private inferRecFunType(val: VRecFun): string {
    const paramTypes = val.params.map(() => "'a");
    return paramTypes.join(' -> ') + ' -> ' + "'b";
  }

  private inferBuiltinType(val: VBuiltin): string {
    return val.name;
  }

  // ── Value Display ───────────────────────────────────────────────────────
  displayValue(val: Value, depth: number = 0): string {
    if (depth > 10) return '...';
    switch (val.tag) {
      case 'int': return val.value.toString();
      case 'float': {
        const s = val.value.toString();
        return s.includes('.') ? s : s + '.';
      }
      case 'string': return `"${val.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`;
      case 'char': return `'${val.value}'`;
      case 'bool': return val.value ? 'true' : 'false';
      case 'unit': return '()';
      case 'list':
        if (val.elements.length === 0) return '[]';
        return `[${val.elements.map(e => this.displayValue(e, depth + 1)).join('; ')}]`;
      case 'tuple':
        return `(${val.elements.map(e => this.displayValue(e, depth + 1)).join(', ')})`;
      case 'fun': return '<fun>';
      case 'recfun': return '<fun>';
      case 'ref': return `{contents = ${this.displayValue(val.value, depth + 1)}}`;
      case 'constructor':
        if (val.value) return `${val.name} ${this.displayValue(val.value, depth + 1)}`;
        return val.name;
      case 'builtin': return `<fun>`;
      case 'record': {
        const fields = Array.from(val.fields.entries()).map(([k, v]) => `${k} = ${this.displayValue(v, depth + 1)}`);
        return `{${fields.join('; ')}}`;
      }
      case 'array':
        return `[|${val.elements.map(e => this.displayValue(e, depth + 1)).join('; ')}|]`;
      default: return '<unknown>';
    }
  }

  // ── Memory State ────────────────────────────────────────────────────────
  getMemoryState(): MemoryState {
    const stack: StackFrameType[] = [];

    // Global environment
    const globalVars: VariableInfo[] = [];
    for (const [name, val] of this.env.bindings) {
      if (!this.isStdlibName(name)) {
        globalVars.push({
          name,
          value: this.displayValue(val),
          type: this.inferType(val),
        });
      }
    }
    if (globalVars.length > 0) {
      stack.push({ name: 'Global', variables: globalVars });
    }

    // Call stack frames (up to 20)
    for (const frame of this.callStack.slice(-20)) {
      if (frame.name === 'toplevel') continue;
      const vars: VariableInfo[] = [];
      for (const [name, val] of frame.env.bindings) {
        vars.push({
          name,
          value: this.displayValue(val),
          type: this.inferType(val),
        });
      }
      if (vars.length > 0) {
        stack.push({ name: frame.name, variables: vars, line: frame.line });
      }
    }

    const typeDefsArr = Array.from(this.typeDefinitions.entries()).map(([name, def]) => ({
      name,
      definition: def.variants.map(v => v.type ? `${v.name} of ${v.type}` : v.name).join(' | '),
    }));

    return {
      stack,
      heap: this.heapObjects,
      environment: globalVars,
      typeDefinitions: typeDefsArr,
    };
  }

  private isStdlibName(name: string): boolean {
    return name.startsWith('List.') || name.startsWith('Array.') || name.startsWith('String.') ||
           name.startsWith('Char.') || name.startsWith('Hashtbl.') || name.startsWith('Buffer.') ||
           ['print_string', 'print_int', 'print_float', 'print_char', 'print_endline', 'print_newline',
            'string_of_int', 'string_of_float', 'int_of_string', 'float_of_string', 'int_of_float',
            'float_of_int', 'char_of_int', 'int_of_char', 'string_of_bool', 'bool_of_string',
            'String.length', 'String.sub', 'String.concat', 'String.make', 'String.uppercase_ascii',
            'String.lowercase_ascii', 'String.contains',
            'fst', 'snd', 'min', 'max', 'abs', 'abs_float', 'sqrt', 'succ', 'pred',
            'failwith', 'invalid_arg', 'ignore',
            'Some', 'None', 'Failure', 'Invalid_argument', 'Not_found', 'Exit',
           ].includes(name);
  }

  // ── Standard Library ────────────────────────────────────────────────────
  private installStdlib(): void {
    const env = this.env;
    const mkBuiltin = (name: string, arity: number, fn: (args: Value[]) => Value): VBuiltin => ({
      tag: 'builtin', name, arity, fn, applied: []
    });

    // Print functions
    env.set('print_string', mkBuiltin('string -> unit', 1, (args) => {
      if (args[0].tag === 'string') this.output.push(args[0].value);
      return { tag: 'unit' };
    }));

    env.set('print_int', mkBuiltin('int -> unit', 1, (args) => {
      if (args[0].tag === 'int') this.output.push(args[0].value.toString());
      return { tag: 'unit' };
    }));

    env.set('print_float', mkBuiltin('float -> unit', 1, (args) => {
      if (args[0].tag === 'float') this.output.push(args[0].value.toString());
      return { tag: 'unit' };
    }));

    env.set('print_char', mkBuiltin('char -> unit', 1, (args) => {
      if (args[0].tag === 'char') this.output.push(args[0].value);
      return { tag: 'unit' };
    }));

    env.set('print_endline', mkBuiltin('string -> unit', 1, (args) => {
      if (args[0].tag === 'string') this.output.push(args[0].value + '\n');
      return { tag: 'unit' };
    }));

    env.set('print_newline', mkBuiltin('unit -> unit', 1, (_) => {
      this.output.push('\n');
      return { tag: 'unit' };
    }));

    env.set('prerr_endline', mkBuiltin('string -> unit', 1, (args) => {
      if (args[0].tag === 'string') this.output.push(args[0].value + '\n');
      return { tag: 'unit' };
    }));

    // Conversion functions
    env.set('string_of_int', mkBuiltin('int -> string', 1, (args) => {
      if (args[0].tag === 'int') return { tag: 'string', value: args[0].value.toString() };
      throw new RuntimeError('string_of_int: expected int');
    }));

    env.set('string_of_float', mkBuiltin('float -> string', 1, (args) => {
      if (args[0].tag === 'float') return { tag: 'string', value: args[0].value.toString() };
      throw new RuntimeError('string_of_float: expected float');
    }));

    env.set('int_of_string', mkBuiltin('string -> int', 1, (args) => {
      if (args[0].tag === 'string') {
        const n = parseInt(args[0].value);
        if (isNaN(n)) throw new RuntimeError('int_of_string: invalid argument');
        return { tag: 'int', value: n };
      }
      throw new RuntimeError('int_of_string: expected string');
    }));

    env.set('float_of_string', mkBuiltin('string -> float', 1, (args) => {
      if (args[0].tag === 'string') {
        const n = parseFloat(args[0].value);
        if (isNaN(n)) throw new RuntimeError('float_of_string: invalid argument');
        return { tag: 'float', value: n };
      }
      throw new RuntimeError('float_of_string: expected string');
    }));

    env.set('int_of_float', mkBuiltin('float -> int', 1, (args) => {
      if (args[0].tag === 'float') return { tag: 'int', value: Math.trunc(args[0].value) };
      throw new RuntimeError('int_of_float: expected float');
    }));

    env.set('float_of_int', mkBuiltin('int -> float', 1, (args) => {
      if (args[0].tag === 'int') return { tag: 'float', value: args[0].value };
      throw new RuntimeError('float_of_int: expected int');
    }));

    env.set('char_of_int', mkBuiltin('int -> char', 1, (args) => {
      if (args[0].tag === 'int') return { tag: 'char', value: String.fromCharCode(args[0].value) };
      throw new RuntimeError('char_of_int: expected int');
    }));

    env.set('int_of_char', mkBuiltin('char -> int', 1, (args) => {
      if (args[0].tag === 'char') return { tag: 'int', value: args[0].value.charCodeAt(0) };
      throw new RuntimeError('int_of_char: expected char');
    }));

    env.set('string_of_bool', mkBuiltin('bool -> string', 1, (args) => {
      if (args[0].tag === 'bool') return { tag: 'string', value: args[0].value ? 'true' : 'false' };
      throw new RuntimeError('string_of_bool: expected bool');
    }));

    // Math functions
    env.set('abs', mkBuiltin('int -> int', 1, (args) => {
      if (args[0].tag === 'int') return { tag: 'int', value: Math.abs(args[0].value) };
      throw new RuntimeError('abs: expected int');
    }));

    env.set('abs_float', mkBuiltin('float -> float', 1, (args) => {
      if (args[0].tag === 'float') return { tag: 'float', value: Math.abs(args[0].value) };
      throw new RuntimeError('abs_float: expected float');
    }));

    env.set('sqrt', mkBuiltin('float -> float', 1, (args) => {
      if (args[0].tag === 'float') return { tag: 'float', value: Math.sqrt(args[0].value) };
      throw new RuntimeError('sqrt: expected float');
    }));

    env.set('succ', mkBuiltin('int -> int', 1, (args) => {
      if (args[0].tag === 'int') return { tag: 'int', value: args[0].value + 1 };
      throw new RuntimeError('succ: expected int');
    }));

    env.set('pred', mkBuiltin('int -> int', 1, (args) => {
      if (args[0].tag === 'int') return { tag: 'int', value: args[0].value - 1 };
      throw new RuntimeError('pred: expected int');
    }));

    env.set('min', mkBuiltin("'a -> 'a -> 'a", 2, (args) => {
      return this.compareValues(args[0], args[1]) <= 0 ? args[0] : args[1];
    }));

    env.set('max', mkBuiltin("'a -> 'a -> 'a", 2, (args) => {
      return this.compareValues(args[0], args[1]) >= 0 ? args[0] : args[1];
    }));

    // Tuple functions
    env.set('fst', mkBuiltin("'a * 'b -> 'a", 1, (args) => {
      if (args[0].tag === 'tuple' && args[0].elements.length >= 2) return args[0].elements[0];
      throw new RuntimeError('fst: expected pair');
    }));

    env.set('snd', mkBuiltin("'a * 'b -> 'b", 1, (args) => {
      if (args[0].tag === 'tuple' && args[0].elements.length >= 2) return args[0].elements[1];
      throw new RuntimeError('snd: expected pair');
    }));

    // Option type
    env.set('Some', { tag: 'constructor', name: 'Some' } as VConstructor);
    env.set('None', { tag: 'constructor', name: 'None' } as VConstructor);

    // Exception constructors
    env.set('Failure', { tag: 'constructor', name: 'Failure' } as VConstructor);
    env.set('Invalid_argument', { tag: 'constructor', name: 'Invalid_argument' } as VConstructor);
    env.set('Not_found', { tag: 'constructor', name: 'Not_found' } as VConstructor);
    env.set('Exit', { tag: 'constructor', name: 'Exit' } as VConstructor);

    env.set('failwith', mkBuiltin('string -> _', 1, (args) => {
      throw new OCamlException({ tag: 'constructor', name: 'Failure', value: args[0] }, 0);
    }));

    env.set('invalid_arg', mkBuiltin('string -> _', 1, (args) => {
      throw new OCamlException({ tag: 'constructor', name: 'Invalid_argument', value: args[0] }, 0);
    }));

    env.set('ignore', mkBuiltin("'a -> unit", 1, (_) => ({ tag: 'unit' })));

    // ── List module ─────────────────────────────────────────────────────
    env.set('List.length', mkBuiltin("'a list -> int", 1, (args) => {
      if (args[0].tag === 'list') return { tag: 'int', value: args[0].elements.length };
      throw new RuntimeError('List.length: expected list');
    }));

    env.set('List.hd', mkBuiltin("'a list -> 'a", 1, (args) => {
      if (args[0].tag === 'list' && args[0].elements.length > 0) return args[0].elements[0];
      throw new RuntimeError('List.hd: empty list');
    }));

    env.set('List.tl', mkBuiltin("'a list -> 'a list", 1, (args) => {
      if (args[0].tag === 'list' && args[0].elements.length > 0) return { tag: 'list', elements: args[0].elements.slice(1) };
      throw new RuntimeError('List.tl: empty list');
    }));

    env.set('List.rev', mkBuiltin("'a list -> 'a list", 1, (args) => {
      if (args[0].tag === 'list') return { tag: 'list', elements: [...args[0].elements].reverse() };
      throw new RuntimeError('List.rev: expected list');
    }));

    env.set('List.map', mkBuiltin("('a -> 'b) -> 'a list -> 'b list", 2, (args) => {
      const fn = args[0];
      const list = args[1];
      if (list.tag !== 'list') throw new RuntimeError('List.map: expected list');
      const result = list.elements.map(e => this.applyOne(fn, e, 0));
      return { tag: 'list', elements: result };
    }));

    env.set('List.mapi', mkBuiltin("(int -> 'a -> 'b) -> 'a list -> 'b list", 2, (args) => {
      const fn = args[0];
      const list = args[1];
      if (list.tag !== 'list') throw new RuntimeError('List.mapi: expected list');
      const result = list.elements.map((e, i) => {
        const partialFn = this.applyOne(fn, { tag: 'int', value: i }, 0);
        return this.applyOne(partialFn, e, 0);
      });
      return { tag: 'list', elements: result };
    }));

    env.set('List.filter', mkBuiltin("('a -> bool) -> 'a list -> 'a list", 2, (args) => {
      const fn = args[0];
      const list = args[1];
      if (list.tag !== 'list') throw new RuntimeError('List.filter: expected list');
      const result = list.elements.filter(e => {
        const v = this.applyOne(fn, e, 0);
        return v.tag === 'bool' && v.value;
      });
      return { tag: 'list', elements: result };
    }));

    env.set('List.fold_left', mkBuiltin("('a -> 'b -> 'a) -> 'a -> 'b list -> 'a", 3, (args) => {
      const fn = args[0];
      let acc = args[1];
      const list = args[2];
      if (list.tag !== 'list') throw new RuntimeError('List.fold_left: expected list');
      for (const e of list.elements) {
        const partial = this.applyOne(fn, acc, 0);
        acc = this.applyOne(partial, e, 0);
      }
      return acc;
    }));

    env.set('List.fold_right', mkBuiltin("('a -> 'b -> 'b) -> 'a list -> 'b -> 'b", 3, (args) => {
      const fn = args[0];
      const list = args[1];
      let acc = args[2];
      if (list.tag !== 'list') throw new RuntimeError('List.fold_right: expected list');
      for (let i = list.elements.length - 1; i >= 0; i--) {
        const partial = this.applyOne(fn, list.elements[i], 0);
        acc = this.applyOne(partial, acc, 0);
      }
      return acc;
    }));

    env.set('List.iter', mkBuiltin("('a -> unit) -> 'a list -> unit", 2, (args) => {
      const fn = args[0];
      const list = args[1];
      if (list.tag !== 'list') throw new RuntimeError('List.iter: expected list');
      for (const e of list.elements) this.applyOne(fn, e, 0);
      return { tag: 'unit' };
    }));

    env.set('List.nth', mkBuiltin("'a list -> int -> 'a", 2, (args) => {
      if (args[0].tag !== 'list') throw new RuntimeError('List.nth: expected list');
      if (args[1].tag !== 'int') throw new RuntimeError('List.nth: expected int');
      if (args[1].value < 0 || args[1].value >= args[0].elements.length)
        throw new RuntimeError('List.nth: index out of bounds');
      return args[0].elements[args[1].value];
    }));

    env.set('List.mem', mkBuiltin("'a -> 'a list -> bool", 2, (args) => {
      if (args[1].tag !== 'list') throw new RuntimeError('List.mem: expected list');
      return { tag: 'bool', value: args[1].elements.some(e => this.compareValues(args[0], e) === 0) };
    }));

    env.set('List.sort', mkBuiltin("('a -> 'a -> int) -> 'a list -> 'a list", 2, (args) => {
      const fn = args[0];
      if (args[1].tag !== 'list') throw new RuntimeError('List.sort: expected list');
      const sorted = [...args[1].elements].sort((a, b) => {
        const result = this.applyOne(this.applyOne(fn, a, 0), b, 0);
        if (result.tag !== 'int') throw new RuntimeError('List.sort: comparison must return int');
        return result.value;
      });
      return { tag: 'list', elements: sorted };
    }));

    env.set('List.assoc', mkBuiltin("'a -> ('a * 'b) list -> 'b", 2, (args) => {
      if (args[1].tag !== 'list') throw new RuntimeError('List.assoc: expected list');
      for (const e of args[1].elements) {
        if (e.tag === 'tuple' && e.elements.length >= 2 && this.compareValues(args[0], e.elements[0]) === 0) {
          return e.elements[1];
        }
      }
      throw new OCamlException({ tag: 'constructor', name: 'Not_found' }, 0);
    }));

    env.set('List.concat', mkBuiltin("'a list list -> 'a list", 1, (args) => {
      if (args[0].tag !== 'list') throw new RuntimeError('List.concat: expected list');
      const result: Value[] = [];
      for (const e of args[0].elements) {
        if (e.tag === 'list') result.push(...e.elements);
      }
      return { tag: 'list', elements: result };
    }));

    env.set('List.flatten', env.get('List.concat')!);

    env.set('List.exists', mkBuiltin("('a -> bool) -> 'a list -> bool", 2, (args) => {
      if (args[1].tag !== 'list') throw new RuntimeError('List.exists: expected list');
      return { tag: 'bool', value: args[1].elements.some(e => {
        const v = this.applyOne(args[0], e, 0);
        return v.tag === 'bool' && v.value;
      })};
    }));

    env.set('List.for_all', mkBuiltin("('a -> bool) -> 'a list -> bool", 2, (args) => {
      if (args[1].tag !== 'list') throw new RuntimeError('List.for_all: expected list');
      return { tag: 'bool', value: args[1].elements.every(e => {
        const v = this.applyOne(args[0], e, 0);
        return v.tag === 'bool' && v.value;
      })};
    }));

    env.set('List.init', mkBuiltin("int -> (int -> 'a) -> 'a list", 2, (args) => {
      if (args[0].tag !== 'int') throw new RuntimeError('List.init: expected int');
      const result: Value[] = [];
      for (let i = 0; i < args[0].value; i++) {
        result.push(this.applyOne(args[1], { tag: 'int', value: i }, 0));
      }
      return { tag: 'list', elements: result };
    }));

    // ── String module ───────────────────────────────────────────────────
    env.set('String.length', mkBuiltin('string -> int', 1, (args) => {
      if (args[0].tag === 'string') return { tag: 'int', value: args[0].value.length };
      throw new RuntimeError('String.length: expected string');
    }));

    env.set('String.sub', mkBuiltin('string -> int -> int -> string', 3, (args) => {
      if (args[0].tag === 'string' && args[1].tag === 'int' && args[2].tag === 'int')
        return { tag: 'string', value: args[0].value.substring(args[1].value, args[1].value + args[2].value) };
      throw new RuntimeError('String.sub: invalid arguments');
    }));

    env.set('String.make', mkBuiltin('int -> char -> string', 2, (args) => {
      if (args[0].tag === 'int' && args[1].tag === 'char')
        return { tag: 'string', value: args[1].value.repeat(args[0].value) };
      throw new RuntimeError('String.make: invalid arguments');
    }));

    env.set('String.concat', mkBuiltin('string -> string list -> string', 2, (args) => {
      if (args[0].tag === 'string' && args[1].tag === 'list') {
        const parts = args[1].elements.map(e => e.tag === 'string' ? e.value : '');
        return { tag: 'string', value: parts.join(args[0].value) };
      }
      throw new RuntimeError('String.concat: invalid arguments');
    }));

    env.set('String.uppercase_ascii', mkBuiltin('string -> string', 1, (args) => {
      if (args[0].tag === 'string') return { tag: 'string', value: args[0].value.toUpperCase() };
      throw new RuntimeError('String.uppercase_ascii: expected string');
    }));

    env.set('String.lowercase_ascii', mkBuiltin('string -> string', 1, (args) => {
      if (args[0].tag === 'string') return { tag: 'string', value: args[0].value.toLowerCase() };
      throw new RuntimeError('String.lowercase_ascii: expected string');
    }));

    env.set('String.contains', mkBuiltin('string -> char -> bool', 2, (args) => {
      if (args[0].tag === 'string' && args[1].tag === 'char')
        return { tag: 'bool', value: args[0].value.includes(args[1].value) };
      throw new RuntimeError('String.contains: invalid arguments');
    }));

    // ── Array module ────────────────────────────────────────────────────
    env.set('Array.length', mkBuiltin("'a array -> int", 1, (args) => {
      if (args[0].tag === 'array') return { tag: 'int', value: args[0].elements.length };
      throw new RuntimeError('Array.length: expected array');
    }));

    env.set('Array.get', mkBuiltin("'a array -> int -> 'a", 2, (args) => {
      if (args[0].tag === 'array' && args[1].tag === 'int') {
        if (args[1].value < 0 || args[1].value >= args[0].elements.length)
          throw new RuntimeError('Array.get: index out of bounds');
        return args[0].elements[args[1].value];
      }
      throw new RuntimeError('Array.get: invalid arguments');
    }));

    env.set('Array.set', mkBuiltin("'a array -> int -> 'a -> unit", 3, (args) => {
      if (args[0].tag === 'array' && args[1].tag === 'int') {
        if (args[1].value < 0 || args[1].value >= args[0].elements.length)
          throw new RuntimeError('Array.set: index out of bounds');
        args[0].elements[args[1].value] = args[2];
        return { tag: 'unit' };
      }
      throw new RuntimeError('Array.set: invalid arguments');
    }));

    env.set('Array.make', mkBuiltin("int -> 'a -> 'a array", 2, (args) => {
      if (args[0].tag !== 'int') throw new RuntimeError('Array.make: expected int');
      const id = this.nextHeapId++;
      return { tag: 'array', elements: Array(args[0].value).fill(args[1]), id };
    }));

    env.set('Array.init', mkBuiltin("int -> (int -> 'a) -> 'a array", 2, (args) => {
      if (args[0].tag !== 'int') throw new RuntimeError('Array.init: expected int');
      const elements: Value[] = [];
      for (let i = 0; i < args[0].value; i++) {
        elements.push(this.applyOne(args[1], { tag: 'int', value: i }, 0));
      }
      const id = this.nextHeapId++;
      return { tag: 'array', elements, id };
    }));

    env.set('Array.to_list', mkBuiltin("'a array -> 'a list", 1, (args) => {
      if (args[0].tag === 'array') return { tag: 'list', elements: [...args[0].elements] };
      throw new RuntimeError('Array.to_list: expected array');
    }));

    env.set('Array.of_list', mkBuiltin("'a list -> 'a array", 1, (args) => {
      if (args[0].tag === 'list') {
        const id = this.nextHeapId++;
        return { tag: 'array', elements: [...args[0].elements], id };
      }
      throw new RuntimeError('Array.of_list: expected list');
    }));

    // ── Char module ─────────────────────────────────────────────────────
    env.set('Char.chr', mkBuiltin('int -> char', 1, (args) => {
      if (args[0].tag === 'int') return { tag: 'char', value: String.fromCharCode(args[0].value) };
      throw new RuntimeError('Char.chr: expected int');
    }));

    env.set('Char.code', mkBuiltin('char -> int', 1, (args) => {
      if (args[0].tag === 'char') return { tag: 'int', value: args[0].value.charCodeAt(0) };
      throw new RuntimeError('Char.code: expected char');
    }));
  }
}

// Custom exception type for OCaml exceptions
class OCamlException extends OCamlError {
  value: Value;
  constructor(value: Value, line: number) {
    const evaluator = new Evaluator();
    super(evaluator.displayValue(value), line, 0, 'Exception');
    this.value = value;
  }
}
