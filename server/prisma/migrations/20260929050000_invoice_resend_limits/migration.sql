-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "lastResentAt" TIMESTAMP(3),
ADD COLUMN "dailyResendCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "dailyResendResetAt" TIMESTAMP(3);
