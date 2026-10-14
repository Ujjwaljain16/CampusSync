import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn()', () => {
  it('joins class names', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2');
  });

  it('drops falsy values', () => {
    expect(cn('class1', undefined, null, false, 'class2')).toBe('class1 class2');
  });

  it('supports conditional object syntax', () => {
    expect(cn('base', { active: true, hidden: false })).toBe('base active');
  });

  it('lets later Tailwind classes override conflicting earlier ones', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });
});
