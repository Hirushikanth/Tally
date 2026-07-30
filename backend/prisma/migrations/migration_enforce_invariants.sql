-- ============================================================
-- Migration: Enforce Accounting Invariants at Database Level
-- ============================================================

-- 1. Append-Only Immutability Trigger
CREATE OR REPLACE FUNCTION enforce_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Immutability violation: % records are append-only and cannot be updated or deleted.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_businessevent_update_delete ON "BusinessEvent";
CREATE TRIGGER prevent_businessevent_update_delete
BEFORE UPDATE OR DELETE ON "BusinessEvent"
FOR EACH ROW EXECUTE FUNCTION enforce_append_only();

DROP TRIGGER IF EXISTS prevent_posting_update_delete ON "Posting";
CREATE TRIGGER prevent_posting_update_delete
BEFORE UPDATE OR DELETE ON "Posting"
FOR EACH ROW EXECUTE FUNCTION enforce_append_only();

-- 2. Zero-Sum Constraint Trigger (DEFERRABLE INITIALLY DEFERRED)
CREATE OR REPLACE FUNCTION check_posting_zero_sum()
RETURNS trigger AS $$
DECLARE
  v_event_id TEXT;
  v_sum BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_event_id := OLD."businessEventId";
  ELSE
    v_event_id := NEW."businessEventId";
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_sum
  FROM "Posting"
  WHERE "businessEventId" = v_event_id;

  IF v_sum != 0 THEN
    RAISE EXCEPTION 'Accounting invariant violation: Postings for BusinessEvent % do not sum to zero (actual sum: %).', v_event_id, v_sum;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_posting_zero_sum ON "Posting";
CREATE CONSTRAINT TRIGGER trigger_check_posting_zero_sum
AFTER INSERT OR UPDATE OR DELETE ON "Posting"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_posting_zero_sum();

-- 3. ">=1 Posting" Constraint Trigger (DEFERRABLE INITIALLY DEFERRED)
CREATE OR REPLACE FUNCTION check_businessevent_has_postings()
RETURNS trigger AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM "Posting"
  WHERE "businessEventId" = NEW.id;

  IF v_count < 1 THEN
    RAISE EXCEPTION 'Accounting invariant violation: BusinessEvent % must have at least 1 posting (found 0).', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_businessevent_has_postings ON "BusinessEvent";
CREATE CONSTRAINT TRIGGER trigger_check_businessevent_has_postings
AFTER INSERT ON "BusinessEvent"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_businessevent_has_postings();

-- 4. Refund Reference CHECK Constraint
ALTER TABLE "BusinessEvent"
DROP CONSTRAINT IF EXISTS check_refund_has_refundof;

ALTER TABLE "BusinessEvent"
ADD CONSTRAINT check_refund_has_refundof
CHECK (type != 'REFUND' OR "refundOfId" IS NOT NULL);
