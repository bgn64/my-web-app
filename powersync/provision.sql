\getenv replication_password PS_REPLICATION_PASSWORD

SELECT 'CREATE ROLE powersync LOGIN REPLICATION'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'powersync'
)
\gexec

ALTER ROLE powersync
    WITH LOGIN REPLICATION PASSWORD :'replication_password';

GRANT CONNECT ON DATABASE todos TO powersync;
GRANT USAGE ON SCHEMA public TO powersync;
GRANT SELECT ON public.todos TO powersync;