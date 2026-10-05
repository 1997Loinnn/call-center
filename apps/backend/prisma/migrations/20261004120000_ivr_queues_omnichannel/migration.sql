-- Navbatlar va IVR (F-TEL-02..06, F-ADM-03): navbat qoidalari, navbat a'zolari, IVR menyulari va ovozli xabarlar.
-- Omnikanal (F-OMNI-01..04): suhbat kontakti, o'qilmagan xabarlar, chiquvchi xabar holati.

-- CreateEnum
CREATE TYPE "IvrAction" AS ENUM ('SUBMENU', 'QUEUE', 'TICKET_STATUS', 'CALLBACK', 'VOICEMAIL', 'PLAYBACK', 'REPEAT', 'HANGUP');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "contactHandle" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" VARCHAR(20),
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "unreadCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "error" TEXT,
ADD COLUMN     "isAuto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" VARCHAR(16);

-- AlterTable
ALTER TABLE "queues" ADD COLUMN     "announceEverySeconds" INTEGER NOT NULL DEFAULT 45,
ADD COLUMN     "announcePosition" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "callbackEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isRestricted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxWaitSeconds" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "musicOnHold" VARCHAR(64) NOT NULL DEFAULT 'default',
ADD COLUMN     "strategy" VARCHAR(32) NOT NULL DEFAULT 'longest_idle',
ADD COLUMN     "wrapUpSeconds" INTEGER NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE "queue_members" (
    "queueId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "penalty" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_members_pkey" PRIMARY KEY ("queueId","userId")
);

-- CreateTable
CREATE TABLE "voice_prompts" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "language" VARCHAR(5) NOT NULL DEFAULT 'uz',
    "text" TEXT NOT NULL,
    "fileName" TEXT,
    "storageKey" TEXT,
    "mimeType" VARCHAR(64),
    "sizeBytes" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ivr_menus" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" TEXT NOT NULL,
    "language" VARCHAR(5),
    "promptId" INTEGER,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 5,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "fallbackQueueId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivr_menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ivr_options" (
    "id" SERIAL NOT NULL,
    "menuId" INTEGER NOT NULL,
    "digit" VARCHAR(1) NOT NULL,
    "label" TEXT NOT NULL,
    "action" "IvrAction" NOT NULL,
    "queueId" INTEGER,
    "targetMenuId" INTEGER,
    "promptId" INTEGER,

    CONSTRAINT "ivr_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "queue_members_userId_idx" ON "queue_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ivr_menus_code_key" ON "ivr_menus"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ivr_options_menuId_digit_key" ON "ivr_options"("menuId", "digit");

-- CreateIndex
CREATE INDEX "conversations_assigneeId_status_idx" ON "conversations"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "conversations_citizenId_idx" ON "conversations"("citizenId");

-- CreateIndex
CREATE INDEX "messages_externalId_idx" ON "messages"("externalId");

-- AddForeignKey
ALTER TABLE "queue_members" ADD CONSTRAINT "queue_members_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_members" ADD CONSTRAINT "queue_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ivr_menus" ADD CONSTRAINT "ivr_menus_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "voice_prompts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ivr_menus" ADD CONSTRAINT "ivr_menus_fallbackQueueId_fkey" FOREIGN KEY ("fallbackQueueId") REFERENCES "queues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ivr_options" ADD CONSTRAINT "ivr_options_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "ivr_menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ivr_options" ADD CONSTRAINT "ivr_options_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "queues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ivr_options" ADD CONSTRAINT "ivr_options_targetMenuId_fkey" FOREIGN KEY ("targetMenuId") REFERENCES "ivr_menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ivr_options" ADD CONSTRAINT "ivr_options_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "voice_prompts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
