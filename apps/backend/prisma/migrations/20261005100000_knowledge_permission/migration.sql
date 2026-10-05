-- Bilimlar bazasini yuritish huquqi (F-OP-06): supervisor va administrator tizim rollariga.
UPDATE "roles"
SET "permissions" = array_append("permissions", 'knowledge.manage')
WHERE "code" IN ('SUPERVISOR', 'ADMIN') AND NOT ('knowledge.manage' = ANY ("permissions"));
