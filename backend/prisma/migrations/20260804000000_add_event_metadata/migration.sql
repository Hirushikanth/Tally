-- AddEventMetadata
-- Human-facing detail facts (who paid, split method, lender/borrower, etc.)
-- are stored as JSON on the BusinessEvent row. They are display metadata only —
-- accounting truth remains in the Posting journal.
ALTER TABLE "BusinessEvent" ADD COLUMN "metadata" JSONB;
