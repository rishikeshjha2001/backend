/**
 * Enterprise Financial Calculation & Rounding Utilities
 * Prevents IEEE-754 floating point arithmetic inaccuracies (e.g. 0.1 + 0.2 = 0.30000000000000004)
 * by performing calculations in integer subunits (paise) and rounding with financial precision.
 */

/**
 * Converts Indian Rupees to integer Paise (1 INR = 100 Paise).
 */
export const toPaise = (rupees: number | string): number => {
  const num = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (isNaN(num) || !isFinite(num)) return 0;
  return Math.round(num * 100);
};

/**
 * Converts integer Paise to Indian Rupees with 2 decimal precision.
 */
export const toRupees = (paise: number): number => {
  if (isNaN(paise) || !isFinite(paise)) return 0;
  return Math.round(paise) / 100;
};

/**
 * Rounds any monetary amount strictly to 2 decimal places.
 */
export const roundCurrency = (amount: number | string): number => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num) || !isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

/**
 * Safely adds two monetary amounts in rupees without precision loss.
 */
export const addMoney = (a: number | string, b: number | string): number => {
  return toRupees(toPaise(a) + toPaise(b));
};

/**
 * Safely subtracts monetary amount b from a in rupees without precision loss.
 */
export const subtractMoney = (a: number | string, b: number | string): number => {
  return toRupees(toPaise(a) - toPaise(b));
};

/**
 * Safely multiplies a monetary amount by a quantity or factor and rounds to 2 decimal places.
 */
export const multiplyMoney = (amount: number | string, factor: number): number => {
  const paise = toPaise(amount);
  return toRupees(Math.round(paise * factor));
};

/**
 * Compares two monetary amounts with a configurable tolerance (default 1 rupee for gateway rounding).
 */
export const isEqualAmount = (a: number | string, b: number | string, tolerance: number = 0.5): boolean => {
  const diff = Math.abs(toPaise(a) - toPaise(b));
  return diff <= toPaise(tolerance);
};

/**
 * Formats a monetary amount into standard Indian Rupee notation (₹ xx,xx,xxx.xx)
 */
export const formatINR = (amount: number | string): string => {
  const num = roundCurrency(amount);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(num);
};
