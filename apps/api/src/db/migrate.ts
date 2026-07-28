import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { Env } from '../env.js';

type MigrationDependencies = {
  createClient: () => { end(): Promise<unknown> };
  createDatabase: (client: unknown) => unknown;
  migrateDatabase: (database: unknown, config: { migrationsFolder: string }) => Promise<unknown>;
  migrationsFolder: string;
};

export async function runMigrations(dependencies?: MigrationDependencies) {
  const migrationClient = dependencies?.createClient()
    ?? postgres(Env.DATABASE_URL, { max: 1 });
  const database = dependencies?.createDatabase(migrationClient)
    ?? drizzle(migrationClient as ReturnType<typeof postgres>);
  try {
    await (dependencies?.migrateDatabase ?? migrate)(
      database as Parameters<typeof migrate>[0],
      { migrationsFolder: dependencies?.migrationsFolder ?? './drizzle' },
    );
  } finally {
    await migrationClient.end();
  }
}
