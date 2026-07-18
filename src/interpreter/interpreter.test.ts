import { describe, expect, it } from 'vitest';
import { interpret } from './index';

function valueOf(source: string, name: string) {
  const result = interpret(source);
  expect(result.errors).toEqual([]);
  return result.values.find((value) => value.name === name);
}

describe('browser OCaml interpreter', () => {
  it('evaluates arithmetic and top-level bindings', () => {
    expect(valueOf('let answer = 40 + 2', 'answer')).toMatchObject({
      type: 'int',
      value: '42',
    });
  });

  it('supports recursive functions', () => {
    const source = `
      let rec factorial n =
        if n <= 1 then 1 else n * factorial (n - 1)
      let result = factorial 6
    `;
    expect(valueOf(source, 'result')?.value).toBe('720');
  });

  it('supports pattern matching and algebraic data types', () => {
    const source = `
      type shape = Circle of float | Rectangle of float * float
      let area = function
        | Circle r -> 3.14 *. r *. r
        | Rectangle (w, h) -> w *. h
      let result = area (Rectangle (4.0, 5.0))
    `;
    expect(valueOf(source, 'result')?.value).toBe('20.');
  });

  it('tracks mutable references in the heap view', () => {
    const result = interpret('let counter = ref 1\nlet () = counter := !counter + 1');
    expect(result.errors).toEqual([]);
    expect(result.memoryState.heap.some((item) => item.type.endsWith(' ref'))).toBe(true);
    expect(result.memoryState.environment.find((item) => item.name === 'counter')?.value).toContain('2');
  });

  it('reports syntax errors without throwing', () => {
    const result = interpret('let = broken');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.output).toBe('');
  });

  it('stops runaway recursion', () => {
    const result = interpret(
      'let rec loop n = loop (n + 1)\nlet result = loop 0',
      { maxRecursionDepth: 25 }
    );
    expect(result.errors[0]?.message).toMatch(/recursion/i);
  });
});
