-- Up Migration
ALTER TABLE public.todos ALTER COLUMN id DROP DEFAULT;

ALTER TABLE public.todos
    ALTER COLUMN id TYPE UUID USING gen_random_uuid();

ALTER TABLE public.todos
    ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Down Migration
DO $$
BEGIN
    RAISE EXCEPTION 'UUID conversion cannot restore the original integer IDs';
END;
$$;