-- Up Migration
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    provider TEXT,
    external_id UUID,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    city TEXT,
    state TEXT,
    country TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    catalog_metadata JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(catalog_metadata) = 'object'),
    UNIQUE (provider, external_id),
    CHECK ((provider IS NULL) = (external_id IS NULL))
);

CREATE TABLE course_scorecards (
    course_id INTEGER PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
    hole_count SMALLINT NOT NULL CHECK (hole_count IN (9, 18)),
    total_par SMALLINT NOT NULL CHECK (total_par > 0),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    warnings JSONB NOT NULL CHECK (jsonb_typeof(warnings) = 'array')
);

CREATE TABLE course_holes (
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    hole_number SMALLINT NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
    par SMALLINT NOT NULL CHECK (par BETWEEN 3 AND 6),
    handicap SMALLINT NOT NULL CHECK (handicap BETWEEN 1 AND 18),
    PRIMARY KEY (course_id, hole_number),
    UNIQUE (course_id, handicap)
);

CREATE TABLE course_tees (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order SMALLINT NOT NULL CHECK (sort_order > 0),
    tee_key TEXT NOT NULL,
    playable BOOLEAN NOT NULL,
    total_yards INTEGER,
    UNIQUE (course_id, name),
    UNIQUE (course_id, sort_order),
    UNIQUE (course_id, tee_key),
    UNIQUE (course_id, id)
);

CREATE TABLE course_yardages (
    course_id INTEGER NOT NULL,
    hole_number SMALLINT NOT NULL,
    tee_id INTEGER NOT NULL,
    yards SMALLINT NOT NULL CHECK (yards > 0),
    PRIMARY KEY (course_id, hole_number, tee_id),
    FOREIGN KEY (course_id, hole_number) REFERENCES course_holes(course_id, hole_number) ON DELETE CASCADE,
    FOREIGN KEY (course_id, tee_id) REFERENCES course_tees(course_id, id) ON DELETE CASCADE
);

CREATE TABLE course_tee_ratings (
    tee_id INTEGER NOT NULL REFERENCES course_tees(id) ON DELETE CASCADE,
    provider_key TEXT NOT NULL,
    gender TEXT,
    color TEXT,
    course_rating DOUBLE PRECISION CHECK (course_rating > 0),
    slope SMALLINT CHECK (slope BETWEEN 55 AND 155),
    par SMALLINT,
    reported_yards INTEGER,
    PRIMARY KEY (tee_id, provider_key)
);

CREATE TABLE golf_rounds (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    snapshot JSONB NOT NULL CHECK (
        jsonb_typeof(snapshot) = 'object' AND
        snapshot ?& ARRAY['version', 'course', 'scorecard'] AND
        snapshot @> '{"version":1}' AND
        jsonb_typeof(snapshot->'course') = 'object' AND
        (snapshot->'course') ?& ARRAY['name', 'location'] AND
        jsonb_typeof(snapshot->'scorecard') = 'object' AND
        (snapshot->'scorecard') ?& ARRAY['holeCount', 'totalPar', 'holes', 'tees'] AND
        jsonb_typeof(snapshot->'scorecard'->'holes') = 'array'
    ),
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX one_active_round_per_user ON golf_rounds(user_id) WHERE finished_at IS NULL;
CREATE INDEX golf_rounds_history ON golf_rounds(user_id, finished_at DESC);

CREATE TABLE round_scores (
    round_id INTEGER NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
    hole_number SMALLINT NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
    strokes SMALLINT CHECK (strokes BETWEEN 1 AND 99),
    PRIMARY KEY (round_id, hole_number)
);

-- Down Migration
DROP TABLE round_scores;
DROP TABLE golf_rounds;
DROP TABLE course_tee_ratings;
DROP TABLE course_yardages;
DROP TABLE course_tees;
DROP TABLE course_holes;
DROP TABLE course_scorecards;
DROP TABLE courses;
