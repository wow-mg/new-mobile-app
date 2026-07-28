import { describe, expect, it, vi } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  refundHistory,
  refundRequests,
  refundTransactions,
  tournaments,
} from '../schema.js';
import { runMigrations } from '../migrate.js';

describe('refund persistence schema and migration boundary', () => {
  it('declares policy columns, restrictive references, and idempotency uniqueness', () => {
    const tournament = getTableConfig(tournaments);
    expect(tournament.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'full_refund_cutoff_hours',
      'partial_refund_cutoff_hours',
      'partial_refund_percent',
    ]));

    const request = getTableConfig(refundRequests);
    expect(request.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'refund_request_id',
      'payment_record_id',
      'application_id',
      'participant_id',
      'policy_snapshot',
      'status',
    ]));
    expect(request.foreignKeys).toHaveLength(3);
    expect(request.indexes.some((index) => index.config.unique
      && index.config.columns.some((column) => 'name' in column && column.name === 'payment_record_id')))
      .toBe(true);

    const transaction = getTableConfig(refundTransactions);
    expect(transaction.foreignKeys).toHaveLength(1);
    expect(transaction.indexes.some((index) => index.config.unique
      && index.config.columns.length === 2)).toBe(true);

    const history = getTableConfig(refundHistory);
    expect(history.foreignKeys).toHaveLength(1);
  });

  it('runs the programmatic migrator and always closes its bounded client', async () => {
    const end = vi.fn(async () => undefined);
    const client = { end };
    const migrateDatabase = vi.fn(async () => undefined);
    const createClient = vi.fn(() => client);

    await runMigrations({
      createClient,
      createDatabase: vi.fn(() => ({ kind: 'test-database' })),
      migrateDatabase,
      migrationsFolder: './drizzle',
    });

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(migrateDatabase).toHaveBeenCalledWith(
      { kind: 'test-database' },
      { migrationsFolder: './drizzle' },
    );
    expect(end).toHaveBeenCalledTimes(1);
  });
});
