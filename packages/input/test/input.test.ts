import { describe, expect, it } from 'vitest';
import { actionForKey, DEFAULT_KEYS, keyLabel } from '../src';

describe('key bindings', () => {
  it('maps physical codes to actions', () => {
    expect(actionForKey(DEFAULT_KEYS, { code: 'KeyE', shiftKey: false })).toBe('endTurn');
    expect(actionForKey(DEFAULT_KEYS, { code: 'Tab', shiftKey: true })).toBe('prevUnit');
    expect(actionForKey(DEFAULT_KEYS, { code: 'Tab', shiftKey: false })).toBe('nextUnit');
    expect(actionForKey(DEFAULT_KEYS, { code: 'KeyZ', shiftKey: false })).toBeNull();
  });
  it('renders readable labels', () => {
    expect(keyLabel(DEFAULT_KEYS, 'endTurn')).toBe('E');
    expect(keyLabel(DEFAULT_KEYS, 'fireSnap')).toBe('1');
  });
});
