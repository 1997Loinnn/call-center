-- Murojaatning qo'shimcha mavzulari (operator bir nechta mavzu tanlaydi; asosiysi tickets.categoryId)
-- va ishtirokchi bo'linmalar (tafsilot paneli → "Ishtirokchilar").

-- CreateTable
CREATE TABLE "ticket_topics" (
    "ticketId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,

    CONSTRAINT "ticket_topics_pkey" PRIMARY KEY ("ticketId","categoryId")
);

-- CreateTable
CREATE TABLE "ticket_participants" (
    "ticketId" INTEGER NOT NULL,
    "orgUnitId" INTEGER NOT NULL,
    "addedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_participants_pkey" PRIMARY KEY ("ticketId","orgUnitId")
);

-- CreateIndex
CREATE INDEX "ticket_topics_categoryId_idx" ON "ticket_topics"("categoryId");

-- CreateIndex
CREATE INDEX "ticket_participants_orgUnitId_idx" ON "ticket_participants"("orgUnitId");

-- AddForeignKey
ALTER TABLE "ticket_topics" ADD CONSTRAINT "ticket_topics_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_topics" ADD CONSTRAINT "ticket_topics_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_participants" ADD CONSTRAINT "ticket_participants_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_participants" ADD CONSTRAINT "ticket_participants_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_participants" ADD CONSTRAINT "ticket_participants_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

