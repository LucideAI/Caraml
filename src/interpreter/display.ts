import type { Value } from './types';

/**
 * Standalone value display function, usable without an Evaluator instance.
 * Used by OCamlException and anywhere else a value needs to be formatted.
 */
export function displayValue(val: Value, depth: number = 0): string {
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
      return `[${val.elements.map(e => displayValue(e, depth + 1)).join('; ')}]`;
    case 'tuple':
      return `(${val.elements.map(e => displayValue(e, depth + 1)).join(', ')})`;
    case 'fun': return '<fun>';
    case 'recfun': return '<fun>';
    case 'ref': return `{contents = ${displayValue(val.value, depth + 1)}}`;
    case 'constructor':
      if (val.value) return `${val.name} ${displayValue(val.value, depth + 1)}`;
      return val.name;
    case 'builtin': return `<fun>`;
    case 'record': {
      const fields = Array.from(val.fields.entries()).map(([k, v]) => `${k} = ${displayValue(v, depth + 1)}`);
      return `{${fields.join('; ')}}`;
    }
    case 'array':
      return `[|${val.elements.map(e => displayValue(e, depth + 1)).join('; ')}|]`;
    default: return '<unknown>';
  }
}
