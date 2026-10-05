-- Prototip modullari uchun jadvallar: murojaat vazifalari ("Vazifalar" tabi), chiquvchi kampaniyalar,
-- fuqaroga SMS jurnali (F-NOT-01), ogohlantirishlar va limitlar (F-MON-03), eksport shablonlari (F-REP-05).
-- Fuqaro kartasiga qo'shimcha aloqa raqamlari.

-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('CALLBACK', 'SURVEY', 'REMINDER', 'INFORM');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignContactStatus" AS ENUM ('PENDING', 'REACHED', 'NO_ANSWER', 'BUSY', 'CALL_LATER', 'WRONG_NUMBER', 'FAILED');

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('CRITICAL', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('XLSX', 'PDF', 'DOCX', 'CSV');

-- AlterTable
ALTER TABLE "citizens" ADD COLUMN     "extraPhones" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ticket_tasks" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "assigneeId" INTEGER,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CampaignType" NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "script" TEXT,
    "queueId" INTEGER,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_contacts" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "fullName" TEXT,
    "citizenId" INTEGER,
    "ticketId" INTEGER,
    "status" "CampaignContactStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "agentId" INTEGER,
    "callId" INTEGER,
    "resolved" VARCHAR(16),
    "rating" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_messages" (
    "id" SERIAL NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "text" TEXT NOT NULL,
    "template" VARCHAR(64),
    "status" "SmsStatus" NOT NULL DEFAULT 'QUEUED',
    "citizenId" INTEGER,
    "ticketId" INTEGER,
    "providerId" VARCHAR(64),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" TEXT NOT NULL,
    "metric" VARCHAR(64) NOT NULL,
    "threshold" INTEGER NOT NULL,
    "unit" VARCHAR(16) NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" SERIAL NOT NULL,
    "ruleId" INTEGER,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "value" INTEGER,
    "details" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" INTEGER,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_templates" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "columns" TEXT[],
    "schedule" VARCHAR(64),
    "recipientRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "export_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_tasks_ticketId_idx" ON "ticket_tasks"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_tasks_assigneeId_completedAt_idx" ON "ticket_tasks"("assigneeId", "completedAt");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaign_contacts_campaignId_status_nextAttemptAt_idx" ON "campaign_contacts"("campaignId", "status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_contacts_campaignId_phone_key" ON "campaign_contacts"("campaignId", "phone");

-- CreateIndex
CREATE INDEX "sms_messages_ticketId_idx" ON "sms_messages"("ticketId");

-- CreateIndex
CREATE INDEX "sms_messages_phone_createdAt_idx" ON "sms_messages"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "sms_messages_status_createdAt_idx" ON "sms_messages"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "alert_rules_code_key" ON "alert_rules"("code");

-- CreateIndex
CREATE INDEX "alerts_status_startedAt_idx" ON "alerts"("status", "startedAt");

-- CreateIndex
CREATE INDEX "alerts_startedAt_idx" ON "alerts"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "export_templates_code_key" ON "export_templates"("code");

-- AddForeignKey
ALTER TABLE "ticket_tasks" ADD CONSTRAINT "ticket_tasks_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_tasks" ADD CONSTRAINT "ticket_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_tasks" ADD CONSTRAINT "ticket_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "queues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "alert_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_templates" ADD CONSTRAINT "export_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

