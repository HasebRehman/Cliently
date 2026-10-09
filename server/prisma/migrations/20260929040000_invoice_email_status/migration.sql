-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "emailFailedAt" TIMESTAMP(3),
ADD COLUMN "emailError" TEXT;
