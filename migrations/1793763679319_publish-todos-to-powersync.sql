-- Up Migration
CREATE PUBLICATION powersync FOR TABLE public.todos;

-- Down Migration
DROP PUBLICATION powersync;