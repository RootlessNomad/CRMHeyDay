-- CreateEnum
CREATE TYPE "CalendarVisibility" AS ENUM ('personal', 'general');

-- CreateEnum
CREATE TYPE "CalendarRelatedEntityType" AS ENUM ('lead', 'company', 'contact');

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "CalendarVisibility" NOT NULL,
    "related_entity_type" "CalendarRelatedEntityType",
    "related_entity_id" TEXT,
    "color" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_events_owner_id_starts_at_idx" ON "calendar_events"("owner_id", "starts_at");

-- CreateIndex
CREATE INDEX "calendar_events_visibility_starts_at_idx" ON "calendar_events"("visibility", "starts_at");

-- CreateIndex
CREATE INDEX "calendar_events_related_entity_type_related_entity_id_idx" ON "calendar_events"("related_entity_type", "related_entity_id");

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
