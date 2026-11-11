-- Up Migration
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    location TEXT NOT NULL
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
    UNIQUE (course_id, name),
    UNIQUE (course_id, sort_order),
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

CREATE TABLE golf_rounds (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    course_name TEXT NOT NULL,
    course_location TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX one_active_round_per_user ON golf_rounds(user_id) WHERE finished_at IS NULL;
CREATE INDEX golf_rounds_history ON golf_rounds(user_id, finished_at DESC);

CREATE TABLE round_holes (
    round_id INTEGER NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
    hole_number SMALLINT NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
    par SMALLINT NOT NULL CHECK (par BETWEEN 3 AND 6),
    handicap SMALLINT NOT NULL CHECK (handicap BETWEEN 1 AND 18),
    yardages JSONB NOT NULL CHECK (jsonb_typeof(yardages) = 'array'),
    strokes SMALLINT CHECK (strokes BETWEEN 1 AND 99),
    PRIMARY KEY (round_id, hole_number)
);

INSERT INTO courses (name, location) VALUES
    ('Pine Hollow', 'Fictional course · 9 holes'),
    ('Meadow Ridge', 'Fictional course · 18 holes');

INSERT INTO course_holes (course_id, hole_number, par, handicap)
SELECT c.id, n, CASE WHEN n % 5 = 0 THEN 5 WHEN n % 3 = 0 THEN 3 ELSE 4 END, n
FROM courses c
CROSS JOIN LATERAL generate_series(1, CASE WHEN c.name = 'Pine Hollow' THEN 9 ELSE 18 END) AS n
WHERE c.name IN ('Pine Hollow', 'Meadow Ridge');

INSERT INTO course_tees (course_id, name, sort_order)
SELECT c.id, t.name, t.sort_order
FROM courses c
CROSS JOIN (VALUES ('Back', 1), ('Middle', 2), ('Forward', 3)) AS t(name, sort_order)
WHERE c.name IN ('Pine Hollow', 'Meadow Ridge');

INSERT INTO course_yardages (course_id, hole_number, tee_id, yards)
SELECT h.course_id, h.hole_number, t.id,
       CASE h.par WHEN 3 THEN 160 WHEN 5 THEN 475 ELSE 350 END
       + ((h.hole_number * 17) % 70) - (t.sort_order - 1) * 35
FROM course_holes h JOIN course_tees t ON t.course_id = h.course_id
JOIN courses c ON c.id = h.course_id
WHERE c.name IN ('Pine Hollow', 'Meadow Ridge');

-- Down Migration
DROP TABLE round_holes;
DROP TABLE golf_rounds;
DROP TABLE course_yardages;
DROP TABLE course_tees;
DROP TABLE course_holes;
DROP TABLE courses;
