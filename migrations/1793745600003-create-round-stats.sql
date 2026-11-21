-- Up Migration
ALTER TABLE golf_rounds ADD COLUMN stats_revision INTEGER NOT NULL DEFAULT 0 CHECK (stats_revision >= 0);

CREATE TABLE stat_definitions (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (
        char_length(name) BETWEEN 1 AND 80 AND
        name = btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
    ),
    kind TEXT NOT NULL CHECK (kind IN ('number', 'boolean')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX stat_definitions_owner ON stat_definitions(user_id, id);

CREATE TABLE round_stats (
    id SERIAL PRIMARY KEY,
    round_id INTEGER NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (
        char_length(name) BETWEEN 1 AND 80 AND
        name = btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
    ),
    kind TEXT NOT NULL CHECK (kind IN ('number', 'boolean')),
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (round_id, position),
    UNIQUE (round_id, id, kind)
);

CREATE TABLE round_stat_values (
    round_id INTEGER NOT NULL,
    round_stat_id INTEGER NOT NULL,
    hole_number SMALLINT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('number', 'boolean')),
    number_value SMALLINT,
    boolean_value BOOLEAN,
    PRIMARY KEY (round_id, round_stat_id, hole_number),
    FOREIGN KEY (round_id, round_stat_id, kind) REFERENCES round_stats(round_id, id, kind) ON DELETE CASCADE,
    FOREIGN KEY (round_id, hole_number) REFERENCES round_scores(round_id, hole_number) ON DELETE CASCADE,
    CHECK (
        (kind = 'number' AND number_value IS NOT NULL AND number_value BETWEEN 0 AND 99 AND boolean_value IS NULL)
        OR (kind = 'boolean' AND boolean_value IS NOT NULL AND number_value IS NULL)
    )
);

CREATE FUNCTION prevent_stat_metadata_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.kind <> OLD.kind OR (TG_TABLE_NAME = 'round_stats' AND NEW.name <> OLD.name) THEN
        RAISE EXCEPTION 'Stat type and round copy metadata are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER stat_definitions_immutable_kind
    BEFORE UPDATE OF kind ON stat_definitions FOR EACH ROW EXECUTE FUNCTION prevent_stat_metadata_changes();
CREATE TRIGGER round_stats_immutable_metadata
    BEFORE UPDATE OF name, kind ON round_stats FOR EACH ROW EXECUTE FUNCTION prevent_stat_metadata_changes();

-- Down Migration
DROP TABLE round_stat_values;
DROP TABLE round_stats;
DROP TABLE stat_definitions;
DROP FUNCTION IF EXISTS prevent_stat_metadata_changes();
ALTER TABLE golf_rounds DROP COLUMN stats_revision;
