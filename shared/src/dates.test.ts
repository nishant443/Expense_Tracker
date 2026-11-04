import { describe, expect, it } from 'vitest';
import {
  addMonthsISO,
  budgetWindow,
  nextOccurrenceAfter,
  occurrencesBetween,
  presetRange,
  previousWindow,
  startOfWeekISO,
} from './dates';

describe('date helpers', () => {
  it('clamps month ends without drifting', () => {
    expect(addMonthsISO('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonthsISO('2024-01-31', 1)).toBe('2024-02-29');
    expect(occurrencesBetween('2025-01-31', 'monthly', '2025-01-01', '2025-05-31')).toEqual([
      '2025-01-31',
      '2025-02-28',
      '2025-03-31',
      '2025-04-30',
      '2025-05-31',
    ]);
  });

  it('handles leap-day yearly schedules', () => {
    expect(occurrencesBetween('2024-02-29', 'yearly', '2024-01-01', '2028-12-31')).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
  });

  it('computes next occurrence strictly after a date', () => {
    expect(nextOccurrenceAfter('2025-01-01', 'weekly', '2025-01-01')).toBe('2025-01-08');
    expect(nextOccurrenceAfter('2025-01-01', 'daily', '2025-03-10')).toBe('2025-03-11');
    expect(nextOccurrenceAfter('2025-01-15', 'monthly', '2025-01-10')).toBe('2025-01-15');
    expect(nextOccurrenceAfter('2025-01-15', 'monthly', '2025-01-15')).toBe('2025-02-15');
  });

  it('computes anchored budget windows', () => {
    const monthly = { period: 'monthly' as const, startDate: '2025-01-05', endDate: null };
    expect(budgetWindow(monthly, '2025-03-04')).toEqual({ start: '2025-02-05', end: '2025-03-04' });
    expect(budgetWindow(monthly, '2025-03-05')).toEqual({ start: '2025-03-05', end: '2025-04-04' });
    expect(budgetWindow(monthly, '2024-12-31')).toBeNull();

    const custom = { period: 'custom' as const, startDate: '2025-06-01', endDate: '2025-06-15' };
    expect(budgetWindow(custom, '2025-06-10')).toEqual({ start: '2025-06-01', end: '2025-06-15' });
    expect(budgetWindow(custom, '2025-06-16')).toBeNull();

    const weekly = { period: 'weekly' as const, startDate: '2025-01-06', endDate: '2025-01-16' };
    expect(budgetWindow(weekly, '2025-01-14')).toEqual({ start: '2025-01-13', end: '2025-01-16' });
  });

  it('computes preset and previous ranges', () => {
    expect(startOfWeekISO('2025-03-09')).toBe('2025-03-03'); // Sunday → Monday
    expect(presetRange('last_month', '2025-03-15')).toEqual({ start: '2025-02-01', end: '2025-02-28' });
    expect(previousWindow({ start: '2025-03-01', end: '2025-03-31' })).toEqual({ start: '2025-02-01', end: '2025-02-28' });
    expect(previousWindow({ start: '2025-01-01', end: '2025-03-31' })).toEqual({ start: '2024-10-01', end: '2024-12-31' });
    expect(previousWindow({ start: '2025-03-03', end: '2025-03-09' })).toEqual({ start: '2025-02-24', end: '2025-03-02' });
  });
});
