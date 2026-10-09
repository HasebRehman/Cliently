-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "clientName" TEXT,
ADD COLUMN "clientEmail" TEXT,
ADD COLUMN "clientAddress" TEXT,
ADD COLUMN "sentAt" TIMESTAMP(3),
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN "nextRunAt" TIMESTAMP(3);
