import { Lexer } from './lexer';
import { Parser } from './parser';
import { Evaluator } from './evaluator';
import type { EvaluatorOptions } from './evaluator';
import type { ExecutionResult } from '../types';
import { OCamlError } from './types';

export function interpret(source: string, options?: EvaluatorOptions): ExecutionResult {
  const startTime = performance.now();

  try {
    // Tokenize
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    // Parse
    const parser = new Parser(tokens);
    const ast = parser.parse();

    // Evaluate
    const evaluator = new Evaluator(options);
    const result = evaluator.evaluate(ast);

    const executionTimeMs = performance.now() - startTime;

    return {
      output: result.output,
      values: result.values,
      errors: result.errors,
      memoryState: result.memoryState,
      executionTimeMs,
    };
  } catch (e: any) {
    const executionTimeMs = performance.now() - startTime;

    if (e instanceof OCamlError) {
      return {
        output: '',
        values: [],
        errors: [{ line: e.line, column: e.column, message: `${e.kind}: ${e.message}` }],
        memoryState: { stack: [], heap: [], environment: [], typeDefinitions: [] },
        executionTimeMs,
      };
    }

    return {
      output: '',
      values: [],
      errors: [{ line: 0, column: 0, message: e.message || 'Unknown error' }],
      memoryState: { stack: [], heap: [], environment: [], typeDefinitions: [] },
      executionTimeMs,
    };
  }
}

// Re-export for direct access
export { Lexer } from './lexer';
export { Parser } from './parser';
export { Evaluator } from './evaluator';
