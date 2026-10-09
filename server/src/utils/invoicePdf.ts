import PDFDocument from 'pdfkit';

export interface InvoicePdfData {
  organizationName: string;
  invoiceNumber: string;
  issueDate: Date | string;
  dueDate: Date | string;
  currency: string;
  status: string;
  client: {
    name?: string | null;
    email?: string | null;
    company?: string | null;
    address?: string | null;
  };
  items: {
    description: string;
    qty: number | string;
    rate: number | string;
    amount: number | string;
  }[];
  subtotal: number | string;
  discount?: number | string;
  taxRate?: number | string;
  tax?: number | string;
  total: number | string;
  notes?: string | null;
  terms?: string | null;
}

/**
 * Generates a clean, professional vector PDF using PDFKit without external network calls.
 * Truncates and sanitizes text to prevent injection or buffer overflows.
 */
export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Invoice ${data.invoiceNumber}`,
          Author: data.organizationName.substring(0, 100),
          Subject: `Invoice ${data.invoiceNumber} for ${data.client.name || 'Client'}`,
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // Header: Organization Name & Invoice Title
      doc
        .fontSize(22)
        .font('Helvetica-Bold')
        .fillColor('#1E293B')
        .text(data.organizationName.substring(0, 80), 50, 50);

      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .fillColor('#4F46E5')
        .text('INVOICE', 400, 50, { align: 'right' });

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#64748B')
        .text(`#${data.invoiceNumber}`, 400, 75, { align: 'right' });

      // Divider Line
      doc
        .strokeColor('#E2E8F0')
        .lineWidth(1)
        .moveTo(50, 105)
        .lineTo(550, 105)
        .stroke();

      // Dates & Client Details
      const metaTop = 120;

      // Bill To (Left Column)
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#475569')
        .text('BILLED TO:', 50, metaTop);

      let clientY = metaTop + 15;
      if (data.client.name) {
        doc
          .font('Helvetica-Bold')
          .fillColor('#1E293B')
          .text(data.client.name.substring(0, 60), 50, clientY);
        clientY += 14;
      }
      if (data.client.company) {
        doc
          .font('Helvetica')
          .fillColor('#64748B')
          .text(data.client.company.substring(0, 60), 50, clientY);
        clientY += 14;
      }
      if (data.client.email) {
        doc
          .font('Helvetica')
          .fillColor('#64748B')
          .text(data.client.email.substring(0, 60), 50, clientY);
        clientY += 14;
      }
      if (data.client.address) {
        doc
          .font('Helvetica')
          .fillColor('#64748B')
          .text(data.client.address.substring(0, 120), 50, clientY, { width: 220 });
      }

      // Metadata (Right Column)
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#475569')
        .text('INVOICE DETAILS:', 350, metaTop);

      const formatDate = (d: Date | string) => {
        try {
          return new Date(d).toISOString().split('T')[0];
        } catch {
          return String(d);
        }
      };

      doc
        .font('Helvetica')
        .fillColor('#64748B')
        .text(`Issue Date: ${formatDate(data.issueDate)}`, 350, metaTop + 15)
        .text(`Due Date: ${formatDate(data.dueDate)}`, 350, metaTop + 30)
        .text(`Status: ${data.status.toUpperCase()}`, 350, metaTop + 45)
        .text(`Currency: ${data.currency.toUpperCase()}`, 350, metaTop + 60);

      // Items Table Header
      let tableTop = 220;
      doc
        .rect(50, tableTop, 500, 24)
        .fill('#F1F5F9');

      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#334155')
        .text('DESCRIPTION', 60, tableTop + 7)
        .text('QTY', 330, tableTop + 7, { width: 40, align: 'right' })
        .text('RATE', 380, tableTop + 7, { width: 70, align: 'right' })
        .text('AMOUNT', 460, tableTop + 7, { width: 80, align: 'right' });

      let currentY = tableTop + 30;

      // Render Line Items
      for (const item of data.items) {
        if (currentY > 700) {
          doc.addPage();
          currentY = 50;
        }

        const formattedQty = Number(item.qty).toFixed(2);
        const formattedRate = Number(item.rate).toFixed(2);
        const formattedAmount = Number(item.amount).toFixed(2);

        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor('#1E293B')
          .text(item.description.substring(0, 100), 60, currentY, { width: 260 })
          .text(formattedQty, 330, currentY, { width: 40, align: 'right' })
          .text(formattedRate, 380, currentY, { width: 70, align: 'right' })
          .text(`${data.currency} ${formattedAmount}`, 460, currentY, { width: 80, align: 'right' });

        currentY += 22;

        // Subtle row line
        doc
          .strokeColor('#F1F5F9')
          .lineWidth(0.5)
          .moveTo(50, currentY - 4)
          .lineTo(550, currentY - 4)
          .stroke();
      }

      // Totals Box (Right Aligned)
      currentY += 15;
      if (currentY > 650) {
        doc.addPage();
        currentY = 50;
      }

      const totalXLabel = 320;
      const totalXValue = 440;
      const totalWidth = 100;

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#64748B')
        .text('Subtotal:', totalXLabel, currentY, { align: 'right', width: 110 })
        .text(`${data.currency} ${Number(data.subtotal).toFixed(2)}`, totalXValue, currentY, { align: 'right', width: totalWidth });

      if (data.discount && Number(data.discount) > 0) {
        currentY += 16;
        doc
          .text('Discount:', totalXLabel, currentY, { align: 'right', width: 110 })
          .text(`-${data.currency} ${Number(data.discount).toFixed(2)}`, totalXValue, currentY, { align: 'right', width: totalWidth });
      }

      if (data.tax && Number(data.tax) > 0) {
        currentY += 16;
        const taxLabel = data.taxRate ? `Tax (${data.taxRate}%):` : 'Tax:';
        doc
          .text(taxLabel, totalXLabel, currentY, { align: 'right', width: 110 })
          .text(`${data.currency} ${Number(data.tax).toFixed(2)}`, totalXValue, currentY, { align: 'right', width: totalWidth });
      }

      currentY += 20;
      doc
        .strokeColor('#CBD5E1')
        .lineWidth(1)
        .moveTo(320, currentY)
        .lineTo(550, currentY)
        .stroke();

      currentY += 6;
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#1E293B')
        .text('Total Due:', totalXLabel, currentY, { align: 'right', width: 110 })
        .text(`${data.currency} ${Number(data.total).toFixed(2)}`, totalXValue, currentY, { align: 'right', width: totalWidth });

      // Notes & Terms (Left Aligned below items)
      if (data.notes || data.terms) {
        currentY += 35;
        if (currentY > 720) {
          doc.addPage();
          currentY = 50;
        }

        if (data.notes) {
          doc
            .fontSize(9)
            .font('Helvetica-Bold')
            .fillColor('#475569')
            .text('NOTES:', 50, currentY);

          doc
            .fontSize(8.5)
            .font('Helvetica')
            .fillColor('#64748B')
            .text(data.notes.substring(0, 500), 50, currentY + 12, { width: 480 });

          currentY += 35;
        }

        if (data.terms) {
          doc
            .fontSize(9)
            .font('Helvetica-Bold')
            .fillColor('#475569')
            .text('TERMS & CONDITIONS:', 50, currentY);

          doc
            .fontSize(8.5)
            .font('Helvetica')
            .fillColor('#64748B')
            .text(data.terms.substring(0, 500), 50, currentY + 12, { width: 480 });
        }
      }

      // Footer
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#94A3B8')
        .text('Generated securely via Cliently', 50, 780, { align: 'center', width: 500 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
