-- Integrity guards that back up the application rules in the database.
-- They prevent accidental rewrites by application code. They are a consistency mechanism,
-- not tamper-proofing: a database administrator can still disable them.
--
-- Deletes of guarded rows are only allowed inside a transaction that has run
--   SELECT set_config('tailorite.purge', 'on', true);
-- which is used exclusively to purge expired demo sandbox studios and to reset the synthetic
-- presenter demo (see src/demo/).

CREATE OR REPLACE FUNCTION tailorite_purge_allowed() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('tailorite.purge', true), '') = 'on'
$$;

CREATE OR REPLACE FUNCTION tailorite_reject_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rows in "%" are immutable', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION tailorite_guard_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF tailorite_purge_allowed() THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'rows in "%" cannot be deleted', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;

-- Published agreement snapshots never change (including versions still awaiting approval).
CREATE TRIGGER brief_version_immutable BEFORE UPDATE ON "BriefVersion"
  FOR EACH ROW EXECUTE FUNCTION tailorite_reject_update();
CREATE TRIGGER brief_version_no_delete BEFORE DELETE ON "BriefVersion"
  FOR EACH ROW EXECUTE FUNCTION tailorite_guard_delete();

-- Customer decisions are final records.
CREATE TRIGGER approval_event_immutable BEFORE UPDATE ON "ApprovalEvent"
  FOR EACH ROW EXECUTE FUNCTION tailorite_reject_update();
CREATE TRIGGER approval_event_no_delete BEFORE DELETE ON "ApprovalEvent"
  FOR EACH ROW EXECUTE FUNCTION tailorite_guard_delete();

-- Manual payment corrections are reversal entries, never edits or deletions.
CREATE TRIGGER manual_payment_immutable BEFORE UPDATE ON "ManualPayment"
  FOR EACH ROW EXECUTE FUNCTION tailorite_reject_update();
CREATE TRIGGER manual_payment_no_delete BEFORE DELETE ON "ManualPayment"
  FOR EACH ROW EXECUTE FUNCTION tailorite_guard_delete();

-- Transcript corrections create new rows; machine output is preserved.
CREATE TRIGGER transcript_immutable BEFORE UPDATE ON "Transcript"
  FOR EACH ROW EXECUTE FUNCTION tailorite_reject_update();
CREATE TRIGGER transcript_no_delete BEFORE DELETE ON "Transcript"
  FOR EACH ROW EXECUTE FUNCTION tailorite_guard_delete();

-- Validated AI results are kept as produced.
CREATE TRIGGER extraction_result_immutable BEFORE UPDATE ON "ExtractionResult"
  FOR EACH ROW EXECUTE FUNCTION tailorite_reject_update();

-- Application activity history is append-only.
CREATE TRIGGER audit_event_immutable BEFORE UPDATE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION tailorite_reject_update();
CREATE TRIGGER audit_event_no_delete BEFORE DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION tailorite_guard_delete();

-- Original source content (text, file key, hash, ownership) never changes. Labels, sender,
-- context, processing state and removal markers may.
CREATE OR REPLACE FUNCTION tailorite_source_content_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."textContent" IS DISTINCT FROM OLD."textContent"
     OR NEW."storageKey" IS DISTINCT FROM OLD."storageKey"
     OR NEW."sha256" IS DISTINCT FROM OLD."sha256"
     OR NEW."orderId" IS DISTINCT FROM OLD."orderId"
     OR NEW."studioId" IS DISTINCT FROM OLD."studioId" THEN
    RAISE EXCEPTION 'original source content is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER source_asset_content_guard BEFORE UPDATE ON "SourceAsset"
  FOR EACH ROW EXECUTE FUNCTION tailorite_source_content_guard();

-- Money and identifiers are validated by the API too; these checks catch programming errors.
ALTER TABLE "ManualPayment" ADD CONSTRAINT manual_payment_amount_positive CHECK ("amountKobo" > 0);
ALTER TABLE "BriefVersion" ADD CONSTRAINT brief_version_money_valid
  CHECK ("totalPriceKobo" >= 0 AND "depositRequiredKobo" >= 0 AND "depositRequiredKobo" <= "totalPriceKobo");
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT approval_request_pending_slot
  CHECK (("status" = 'PENDING' AND "pendingSlot" = "orderId") OR ("status" <> 'PENDING' AND "pendingSlot" IS NULL));
ALTER TABLE "ChangeRequest" ADD CONSTRAINT change_request_open_slot
  CHECK (
    ("status" IN ('REQUESTED', 'DRAFTING', 'AWAITING_APPROVAL') AND "openSlot" = "orderId")
    OR ("status" NOT IN ('REQUESTED', 'DRAFTING', 'AWAITING_APPROVAL') AND "openSlot" IS NULL)
  );
