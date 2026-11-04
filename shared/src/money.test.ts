import { describe, expect, it } from 'vitest';
import {
  addMoney,
  isPositiveMoney,
  parseMoneyInput,
  percentChange,
  percentOf,
  subMoney,
  sumMoney,
  toMoneyString,
} from './money';

describe('money helpers', () => {
  it('avoids floating point drift', () => {
    expect(addMoney('0.1', '0.2')).toBe('0.30');
    expect(sumMoney(Array.from({ length: 10 }, () => '0.10'))).toBe('1.00');
    expect(subMoney('100.00', '99.99')).toBe('0.01');
    expect(addMoney('999999999999.99', '0.01')).toBe('1000000000000.00');
  });

  it('formats canonical 2dp strings with half-up rounding', () => {
    expect(toMoneyString('1')).toBe('1.00');
    expect(toMoneyString('1.005')).toBe('1.01');
    expect(toMoneyString('2.675')).toBe('2.68');
  });

  it('validates positive amounts', () => {
    expect(isPositiveMoney('10')).toBe(true);
    expect(isPositiveMoney('10.5')).toBe(true);
    expect(isPositiveMoney('0')).toBe(false);
    expect(isPositiveMoney('0.00')).toBe(false);
    expect(isPositiveMoney('-5')).toBe(false);
    expect(isPositiveMoney('1.234')).toBe(false);
    expect(isPositiveMoney('1e5')).toBe(false);
    expect(isPositiveMoney('1000000000000')).toBe(false);
  });

  it('parses user input', () => {
    expect(parseMoneyInput('1,234.5')).toBe('1234.50');
    expect(parseMoneyInput(' 12 ')).toBe('12.00');
    expect(parseMoneyInput('12.345')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
  });

  it('computes percentages', () => {
    expect(percentOf('70', '100')).toBe(70);
    expect(percentOf('1', '3')).toBe(33.3);
    expect(percentOf('5', '0')).toBeNull();
    expect(percentChange('118', '100')).toBe(18);
    expect(percentChange('50', '100')).toBe(-50);
    expect(percentChange('50', '0')).toBeNull();
  });
});
