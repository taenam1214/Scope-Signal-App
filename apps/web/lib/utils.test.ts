import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('dedupes conflicting tailwind classes (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('drops falsy conditionals', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });
});
