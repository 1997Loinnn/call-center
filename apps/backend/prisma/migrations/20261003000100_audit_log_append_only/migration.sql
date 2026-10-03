-- Audit jurnali faqat qo'shiladi (TZ 9-bo'lim): UPDATE va DELETE ma'lumotlar bazasi darajasida taqiqlanadi.
CREATE OR REPLACE FUNCTION audit_logs_block_modification() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs jadvali faqat qo''shish uchun: % taqiqlangan', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_modification();

-- TRUNCATE ham taqiqlanadi
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_modification();
