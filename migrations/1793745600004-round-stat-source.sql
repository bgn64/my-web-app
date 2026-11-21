-- Up Migration
ALTER TABLE round_stats ADD COLUMN source_definition_id INTEGER
    REFERENCES stat_definitions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX round_stats_source_once
    ON round_stats(round_id, source_definition_id)
    WHERE source_definition_id IS NOT NULL;

-- Down Migration
DROP INDEX round_stats_source_once;
ALTER TABLE round_stats DROP COLUMN source_definition_id;
