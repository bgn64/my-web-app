module.exports = {
  // An empty connection object lets pg use the same PG* variables as the app.
  "database-url-var": {},
  "migrations-dir": "migrations",
  "migrations-table": "pgmigrations",
  schema: "public",
};
