import { describe, it, expect } from 'vitest';
import { calculateLiveInvoiceTotals } from '../lib/invoiceCalculator.js';

describe('Invoice Decimal.js Calculator & Server Rounding Parity', () => {
  it('correctly calculates 3 x 0.10 without IEEE-754 float precision artifact (0.30000000000000004)', () => {
    const result = calculateLiveInvoiceTotals({
      items: [
        { description: 'Item 1', qty: 3, rate: 0.1 },
      ],
      discount: 0,
      taxRate: 0,
    });

    expect(result.subtotal).toBe(0.3);
    expect(result.subtotalFormatted).toBe('0.30');
    expect(result.total).toBe(0.3);
    expect(result.totalFormatted).toBe('0.30');
  });

  it('correctly calculates tax on discounted subtotal with ROUND_HALF_UP precision (e.g. $100 subtotal, $15 discount, 8.25% tax)', () => {
    // Subtotal: 100.00
    // Discount: 15.00 => Discounted Subtotal = 85.00
    // Tax: 85 * 0.0825 = 7.0125 => rounded HALF_UP = 7.01
    // Total: 85 + 7.01 = 92.01
    const result = calculateLiveInvoiceTotals({
      items: [
        { description: 'Design Sprint', qty: 1, rate: 100.0 },
      ],
      discount: 15.0,
      taxRate: 8.25,
    });

    expect(result.subtotal).toBe(100.0);
    expect(result.subtotalFormatted).toBe('100.00');
    expect(result.discount).toBe(15.0);
    expect(result.discountFormatted).toBe('15.00');
    expect(result.tax).toBe(7.01);
    expect(result.taxFormatted).toBe('7.01');
    expect(result.total).toBe(92.01);
    expect(result.totalFormatted).toBe('92.01');
  });

  it('handles multi-item precision with fractional quantities and rates', () => {
    // Item 1: 3.333 hrs @ $75.25/hr = 250.80825 => 250.81
    // Item 2: 2 units @ $49.99 = 99.98
    // Subtotal = 250.81 + 99.98 = 350.79
    // Discount = 50.00 => Discounted Subtotal = 300.79
    // Tax (10%) = 30.079 => rounded HALF_UP = 30.08
    // Total = 300.79 + 30.08 = 330.87
    const result = calculateLiveInvoiceTotals({
      items: [
        { description: 'Development Hours', qty: 3.333, rate: 75.25 },
        { description: 'Monthly Retainer', qty: 2, rate: 49.99 },
      ],
      discount: 50.0,
      taxRate: 10.0,
    });

    expect(result.items[0].amount).toBe(250.81);
    expect(result.items[1].amount).toBe(99.98);
    expect(result.subtotal).toBe(350.79);
    expect(result.tax).toBe(30.08);
    expect(result.total).toBe(330.87);
    expect(result.totalFormatted).toBe('330.87');
  });

  it('handles zero discount, negative discount clamp, and zero tax rate safely', () => {
    const result = calculateLiveInvoiceTotals({
      items: [{ description: 'Test', qty: 1, rate: 50 }],
      discount: -10, // Should clamp to 0
      taxRate: 0,
    });

    expect(result.subtotal).toBe(50.0);
    expect(result.discount).toBe(0.0);
    expect(result.tax).toBe(0.0);
    expect(result.total).toBe(50.0);
  });
});
