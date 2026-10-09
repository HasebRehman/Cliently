import Decimal from 'decimal.js';
import { AppError } from '../middlewares/errorHandler.js';

// Configure Decimal for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export interface LineItemInput {
  description: string;
  qty: number | string;
  rate: number | string;
}

export interface CalculationInput {
  items: LineItemInput[];
  discount?: number | string | null;
  taxRate?: number | string | null; // Percentage: 0 to 100
}

export interface CalculatedLineItem {
  description: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface CalculatedInvoiceTotals {
  items: CalculatedLineItem[];
  subtotal: number;
  discount: number;
  taxRate: number;
  tax: number;
  total: number;
}

/**
 * Safely parse a value into a Decimal instance via String conversion,
 * strictly rejecting NaN, Infinity, -Infinity, negative zero (-0), or invalid formats.
 */
function toSafeDecimal(val: unknown, fieldName: string): Decimal {
  if (val === undefined || val === null || val === '') {
    return new Decimal(0);
  }

  if (typeof val === 'number') {
    if (!Number.isFinite(val) || Number.isNaN(val) || Object.is(val, -0)) {
      throw new AppError(`Invalid numeric value for ${fieldName}: NaN, Infinity, or -0 rejected.`, 422, 'INVALID_NUMERIC_VALUE');
    }
  }

  const strVal = String(val).trim();
  if (strVal === '-0' || strVal === '-0.0' || strVal === '-0.00') {
    throw new AppError(`Invalid numeric value for ${fieldName}: negative zero rejected.`, 422, 'INVALID_NUMERIC_VALUE');
  }

  try {
    const d = new Decimal(strVal);
    if (d.isNaN() || !d.isFinite()) {
      throw new AppError(`Invalid numeric value for ${fieldName}.`, 422, 'INVALID_NUMERIC_VALUE');
    }
    return d;
  } catch {
    throw new AppError(`Invalid numeric format for ${fieldName}.`, 422, 'INVALID_NUMERIC_FORMAT');
  }
}

/**
 * Pure function: Calculates invoice line item amounts, subtotal, discount, tax, and total.
 * Uses Decimal.js with ROUND_HALF_UP to 2 decimal places to guarantee financial accuracy.
 */
export function calculateInvoiceTotals(input: CalculationInput): CalculatedInvoiceTotals {
  if (!input.items || input.items.length === 0) {
    throw new AppError('Invoice must have at least one line item.', 422, 'EMPTY_LINE_ITEMS');
  }

  if (input.items.length > 100) {
    throw new AppError('Invoice cannot exceed 100 line items.', 422, 'MAX_LINE_ITEMS_EXCEEDED');
  }

  let subtotalAcc = new Decimal(0);
  const calculatedItems: CalculatedLineItem[] = [];

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    const qty = toSafeDecimal(item.qty, `Line item #${i + 1} quantity`);
    const rate = toSafeDecimal(item.rate, `Line item #${i + 1} rate`);

    if (qty.isNegative() || qty.isZero()) {
      throw new AppError(`Line item #${i + 1} quantity must be greater than 0.`, 422, 'INVALID_QTY');
    }

    // Decimal validation: qty max 3 decimals
    if (qty.decimalPlaces() > 3) {
      throw new AppError(`Line item #${i + 1} quantity cannot exceed 3 decimal places.`, 422, 'INVALID_QTY_PRECISION');
    }

    if (qty.greaterThan(1000000)) {
      throw new AppError(`Line item #${i + 1} quantity exceeds sane limit (max: 1,000,000).`, 422, 'QTY_OVERFLOW');
    }

    if (rate.isNegative()) {
      throw new AppError(`Line item #${i + 1} rate cannot be negative.`, 422, 'INVALID_RATE');
    }

    // Decimal validation: rate max 2 decimals
    if (rate.decimalPlaces() > 2) {
      throw new AppError(`Line item #${i + 1} rate cannot exceed 2 decimal places.`, 422, 'INVALID_RATE_PRECISION');
    }

    if (rate.greaterThan(1000000000)) {
      throw new AppError(`Line item #${i + 1} rate exceeds sane limit (max: 1,000,000,000).`, 422, 'RATE_OVERFLOW');
    }

    // Line Amount = qty * rate (rounded half up to 2 decimals)
    const amount = qty.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    subtotalAcc = subtotalAcc.plus(amount);

    calculatedItems.push({
      description: item.description.trim(),
      qty: qty.toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toNumber(),
      rate: rate.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      amount: amount.toNumber(),
    });
  }

  const subtotal = subtotalAcc.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Discount validation: max 2 decimals
  const discount = toSafeDecimal(input.discount, 'Discount');
  if (discount.isNegative()) {
    throw new AppError('Discount cannot be negative.', 422, 'INVALID_DISCOUNT');
  }
  if (discount.decimalPlaces() > 2) {
    throw new AppError('Discount cannot exceed 2 decimal places.', 422, 'INVALID_DISCOUNT_PRECISION');
  }
  if (discount.greaterThan(subtotal)) {
    throw new AppError('Discount cannot exceed invoice subtotal.', 422, 'DISCOUNT_EXCEEDS_SUBTOTAL');
  }

  // Tax Rate validation (0% to 100%): max 2 decimals
  const taxRate = toSafeDecimal(input.taxRate, 'Tax rate');
  if (taxRate.isNegative() || taxRate.greaterThan(100)) {
    throw new AppError('Tax rate must be between 0% and 100%.', 422, 'INVALID_TAX_RATE');
  }
  if (taxRate.decimalPlaces() > 2) {
    throw new AppError('Tax rate cannot exceed 2 decimal places.', 422, 'INVALID_TAX_RATE_PRECISION');
  }

  // Tax calculated on discounted subtotal
  const discountedSubtotal = subtotal.minus(discount);
  const tax = discountedSubtotal.times(taxRate.dividedBy(100)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Grand Total = (subtotal - discount) + tax
  const total = discountedSubtotal.plus(tax).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  if (total.greaterThan(9999999999.99)) {
    throw new AppError('Grand total exceeds maximum allowable limit (9,999,999,999.99).', 422, 'TOTAL_OVERFLOW');
  }

  return {
    items: calculatedItems,
    subtotal: subtotal.toNumber(),
    discount: discount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    taxRate: taxRate.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    tax: tax.toNumber(),
    total: total.toNumber(),
  };
}
