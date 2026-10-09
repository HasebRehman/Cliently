import { describe, it, expect } from 'vitest';
import { calculateInvoiceTotals } from '../utils/invoiceCalculator.js';
import { AppError } from '../middlewares/errorHandler.js';

describe('Phase 4 - Pure Invoice Calculation Engine & Money Rules', () => {
  describe('Accurate Arithmetic & Rounding', () => {
    it('accurately calculates line item amounts with round-half-up (e.g., 3 x 0.10 = 0.30)', () => {
      const result = calculateInvoiceTotals({
        items: [
          { description: 'Widget A', qty: 3, rate: 0.1 },
          { description: 'Widget B', qty: 1.5, rate: 33.33 }, // 1.5 * 33.33 = 49.995 -> rounds to 50.00
        ],
      });

      expect(result.items[0].amount).toBe(0.3);
      expect(result.items[1].amount).toBe(50.0);
      expect(result.subtotal).toBe(50.3);
      expect(result.total).toBe(50.3);
    });

    it('avoids floating point errors (0.1 + 0.2 line items sum to 0.30 exactly)', () => {
      const result = calculateInvoiceTotals({
        items: [
          { description: 'Item 1', qty: 1, rate: 0.1 },
          { description: 'Item 2', qty: 1, rate: 0.2 },
        ],
      });

      expect(result.subtotal).toBe(0.3);
      expect(result.total).toBe(0.3);
    });

    it('calculates tax strictly on discounted subtotal', () => {
      // Subtotal: 100.00, Discount: 20.00 -> Discounted: 80.00
      // Tax: 10% of 80.00 = 8.00
      // Grand Total: 80.00 + 8.00 = 88.00
      const result = calculateInvoiceTotals({
        items: [{ description: 'Consulting', qty: 1, rate: 100 }],
        discount: 20,
        taxRate: 10,
      });

      expect(result.subtotal).toBe(100.0);
      expect(result.discount).toBe(20.0);
      expect(result.taxRate).toBe(10.0);
      expect(result.tax).toBe(8.0);
      expect(result.total).toBe(88.0);
    });

    it('handles decimal precision with odd rates correctly', () => {
      // 3 items @ 9.99 = 29.97
      // 7.5% tax on 29.97 = 2.24775 -> rounds to 2.25
      // Total: 29.97 + 2.25 = 32.22
      const result = calculateInvoiceTotals({
        items: [{ description: 'Item', qty: 3, rate: 9.99 }],
        taxRate: 7.5,
      });

      expect(result.subtotal).toBe(29.97);
      expect(result.tax).toBe(2.25);
      expect(result.total).toBe(32.22);
    });

    it('handles large valid financial numbers accurately', () => {
      const result = calculateInvoiceTotals({
        items: [{ description: 'Enterprise Retainer', qty: 10, rate: 500000.5 }],
        taxRate: 15,
      });

      expect(result.subtotal).toBe(5000005.0);
      expect(result.tax).toBe(750000.75);
      expect(result.total).toBe(5750005.75);
    });
  });

  describe('Validation & Bounds Enforcement', () => {
    it('throws error on empty line items', () => {
      expect(() => calculateInvoiceTotals({ items: [] })).toThrow(AppError);
    });

    it('rejects line item with zero or negative quantity', () => {
      expect(() =>
        calculateInvoiceTotals({
          items: [{ description: 'Item', qty: 0, rate: 100 }],
        })
      ).toThrow(AppError);

      expect(() =>
        calculateInvoiceTotals({
          items: [{ description: 'Item', qty: -5, rate: 100 }],
        })
      ).toThrow(AppError);
    });

    it('rejects line item with negative rate', () => {
      expect(() =>
        calculateInvoiceTotals({
          items: [{ description: 'Item', qty: 1, rate: -50 }],
        })
      ).toThrow(AppError);
    });

    it('rejects rate exceeding 2 decimal places (rate max 2 decimals)', () => {
      expect(() =>
        calculateInvoiceTotals({
          items: [{ description: 'Item', qty: 1, rate: '10.999' }],
        })
      ).toThrow(AppError);
    });

    it('rejects qty exceeding 3 decimal places (qty max 3 decimals)', () => {
      expect(() =>
        calculateInvoiceTotals({
          items: [{ description: 'Item', qty: '1.1234', rate: 10 }],
        })
      ).toThrow(AppError);
    });

    it('rejects discount exceeding 2 decimal places', () => {
      expect(() =>
        calculateInvoiceTotals({
          items: [{ description: 'Item', qty: 1, rate: 100 }],
          discount: '10.555',
        })
      ).toThrow(AppError);
    });

    it('rejects tax rate exceeding 2 decimal places', () => {
      expect(() =>
        calculateInvoiceTotals({
          items: [{ description: 'Item', qty: 1, rate: 100 }],
          taxRate: '7.125',
        })
      ).toThrow(AppError);
    });

    it('rejects NaN, Infinity, -Infinity, and negative zero (-0) cases', () => {
      expect(() =>
        calculateInvoiceTotals({
          items: [{ description: 'Item', qty: NaN as any, rate: 100 }],
        })
      ).toThrow(AppError);

      expect(() =>
        calculateInvoiceTotals({
          items: [{ description: 'Item', qty: Infinity as any, rate: 100 }],
        })
      ).toThrow(AppError);

      expect(() =>
        calculateInvoiceTotals({
          items: [{ description: 'Item', qty: -0 as any, rate: 100 }],
        })
      ).toThrow(AppError);

      expect(() =>
        calculateInvoiceTotals({
          items: [{ description: 'Item', qty: '-0', rate: 100 }],
        })
      ).toThrow(AppError);
    });

    it('rejects discount exceeding invoice subtotal', () => {
      expect(() =>
        calculateInvoiceTotals({
          items: [{ description: 'Item', qty: 1, rate: 100 }],
          discount: 150,
        })
      ).toThrow(AppError);
    });

    it('rejects negative discount or tax rate', () => {
      expect(() =>
        calculateInvoiceTotals({
          items: [{ description: 'Item', qty: 1, rate: 100 }],
          discount: -10,
        })
      ).toThrow(AppError);

      expect(() =>
        calculateInvoiceTotals({
          items: [{ description: 'Item', qty: 1, rate: 100 }],
          taxRate: -5,
        })
      ).toThrow(AppError);
    });

    it('rejects tax rate exceeding 100%', () => {
      expect(() =>
        calculateInvoiceTotals({
          items: [{ description: 'Item', qty: 1, rate: 100 }],
          taxRate: 105,
        })
      ).toThrow(AppError);
    });

    it('rejects line items exceeding 100 items', () => {
      const excessiveItems = Array.from({ length: 101 }, (_, i) => ({
        description: `Item ${i + 1}`,
        qty: 1,
        rate: 10,
      }));

      expect(() => calculateInvoiceTotals({ items: excessiveItems })).toThrow(AppError);
    });
  });
});
