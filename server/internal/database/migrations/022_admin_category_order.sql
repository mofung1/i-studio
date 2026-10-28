ALTER TABLE inspiration_categories ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 1000000;
WITH ranked AS (
 SELECT c.id, (row_number() OVER (ORDER BY min(p.sort_order) ASC NULLS LAST,c.name ASC)-1)*10 AS position
 FROM inspiration_categories c LEFT JOIN inspiration_prompts p ON p.category=c.name GROUP BY c.id,c.name
)
UPDATE inspiration_categories c SET sort_order=r.position FROM ranked r WHERE c.id=r.id;

ALTER TABLE registration_invite ADD COLUMN IF NOT EXISTS code_encrypted text NOT NULL DEFAULT '';
