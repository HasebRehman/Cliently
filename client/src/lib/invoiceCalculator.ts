import Decimal from 'decimal.js';

// Configure Decimal for exact financial precision matching the server
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export interface CalcLineItemInput {
  description: string;
  qty: number | string;
  rate: number | string;
}

export interface InvoiceCalculationInput {
  items: CalcLineItemInput[];
  discount?: number | string | null;
  taxRate?: number | string | null; // e.g., 8.25 for 8.25%
}

export interface ComputedLineItem {
  description: string;
  qty: number;
  rate: number;
  amount: number;
  amountFormatted: string;
}

export interface ComputedInvoiceTotals {
  items: ComputedLineItem[];
  subtotal: number;
  discount: number;
  taxRate: number;
  tax: number;
  total: number;
  subtotalFormatted: string;
  discountFormatted: string;
  taxFormatted: string;
  totalFormatted: string;
}

function toSafeDecimal(val: unknown): Decimal {
  if (val === undefined || val === null || val === '') {
    return new Decimal(0);
  }
  const str = String(val).trim();
  if (str === '-0' || str === '-0.0' || str === '-0.00' || str === '') {
    return new Decimal(0);
  }
  try {
    const d = new Decimal(str);
    if (d.isNaN() || !d.isFinite()) {
      return new Decimal(0);
    }
    return d;
  } catch {
    return new Decimal(0);
  }
}

/**
 * Live Invoice Totals Calculator (Client-side estimate)
 * Guarantees mathematical parity with server/src/utils/invoiceCalculator.ts
 * using Decimal.js ROUND_HALF_UP at 2 decimal places.
 */
export function calculateLiveInvoiceTotals(input: InvoiceCalculationInput): ComputedInvoiceTotals {
  const items = input.items || [];
  let subtotalAcc = new Decimal(0);
  const computedItems: ComputedLineItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const qty = toSafeDecimal(item.qty);
    const rate = toSafeDecimal(item.rate);

    // Line Amount = qty * rate (rounded half up to 2 decimals)
    const amount = qty.isPositive() && rate.isPositive()
      ? qty.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      : new Decimal(0);

    subtotalAcc = subtotalAcc.plus(amount);

    computedItems.push({
      description: item.description || '',
      qty: qty.toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toNumber(),
      rate: rate.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      amount: amount.toNumber(),
      amountFormatted: amount.toFixed(2),
    });
  }

  const subtotal = subtotalAcc.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  let discount = toSafeDecimal(input.discount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (discount.isNegative()) {
    discount = new Decimal(0);
  }
  if (discount.greaterThan(subtotal)) {
    discount = subtotal;
  }

  let taxRate = toSafeDecimal(input.taxRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (taxRate.isNegative()) {
    taxRate = new Decimal(0);
  }
  if (taxRate.greaterThan(100)) {
    taxRate = new Decimal(100);
  }

  // Tax calculated on discounted subtotal
  const discountedSubtotal = subtotal.minus(discount);
  const tax = discountedSubtotal.times(taxRate.dividedBy(100)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const total = discountedSubtotal.plus(tax).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    items: computedItems,
    subtotal: subtotal.toNumber(),
    discount: discount.toNumber(),
    taxRate: taxRate.toNumber(),
    tax: tax.toNumber(),
    total: total.toNumber(),
    subtotalFormatted: subtotal.toFixed(2),
    discountFormatted: discount.toFixed(2),
    taxFormatted: tax.toFixed(2),
    totalFormatted: total.toFixed(2),
  };
}
