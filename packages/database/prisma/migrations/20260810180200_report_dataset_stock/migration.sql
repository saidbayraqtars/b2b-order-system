-- Alone in its own migration: PostgreSQL refuses to use a value added to an
-- enum in the same transaction that added it, so anything else here would fail.
ALTER TYPE "ReportDataset" ADD VALUE 'STOCK';
