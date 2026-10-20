"""Background worker: durable audit jobs (RQ). Reads/writes the database with
the service role and independently scopes every query by the audit's
organization and project."""
