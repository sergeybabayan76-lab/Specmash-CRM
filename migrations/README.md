# Database migrations

`schema.sql` is the immutable baseline for a new database. It creates the
initial CRM schema and is recorded as `20261029_initial_schema`.

All later database changes must be added as a new SQL file in this directory.
Use a sortable UTC timestamp and a short description:

```text
20261115_add_customer_tags.sql
```

Rules:

1. Never edit a migration after it has been applied.
2. Make migrations safe to run once and keep them inside one transaction.
3. Use `IF EXISTS`/`IF NOT EXISTS` when that is appropriate for deployments.
4. Update application code and the migration in the same change.
5. Test against a fresh database and an existing database before release.

The application applies pending files automatically at startup. It records
the filename and SHA-256 checksum in `public.schema_migrations`. If an
already-applied file changes, startup fails instead of silently running a
different migration.

For a new feature:

```text
1. Add migrations/YYYYMMDDHHMMSS_feature.sql
2. Add the related application code
3. Start the stack and verify /api/health
4. Commit the migration and code together
```
