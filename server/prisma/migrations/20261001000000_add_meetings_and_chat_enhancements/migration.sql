-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "meetingId" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'text';

-- AlterTable
ALTER TABLE "chat_rooms" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'instant',
    "provider" TEXT NOT NULL DEFAULT 'jaas',
    "roomName" TEXT NOT NULL,
    "meetLink" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'live',
    "googleEventId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_attendees" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT,
    "clientId" TEXT,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'team',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meetings_roomName_key" ON "meetings"("roomName");

-- CreateIndex
CREATE INDEX "meetings_companyId_idx" ON "meetings"("companyId");

-- CreateIndex
CREATE INDEX "meetings_projectId_idx" ON "meetings"("projectId");

-- CreateIndex
CREATE INDEX "meetings_createdById_idx" ON "meetings"("createdById");

-- CreateIndex
CREATE INDEX "meetings_status_idx" ON "meetings"("status");

-- CreateIndex
CREATE INDEX "meeting_attendees_meetingId_idx" ON "meeting_attendees"("meetingId");

-- CreateIndex
CREATE INDEX "meeting_attendees_userId_idx" ON "meeting_attendees"("userId");

-- CreateIndex
CREATE INDEX "meeting_attendees_clientId_idx" ON "meeting_attendees"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_attendees_meetingId_email_key" ON "meeting_attendees"("meetingId", "email");

-- CreateIndex
CREATE INDEX "chat_messages_meetingId_idx" ON "chat_messages"("meetingId");

-- CreateIndex
CREATE INDEX "chat_rooms_projectId_idx" ON "chat_rooms"("projectId");

-- AddForeignKey
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
