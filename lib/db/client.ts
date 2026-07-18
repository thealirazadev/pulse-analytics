import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * Server-only Postgres access. A single lazily-created connection pool per
 * process; postgres.js connects on first query, so importing this module is
 * cheap and env is validated the first time the pool is actually needed.
 */

export type Sql = ReturnType<typeof postgres>;
export type Database = ReturnType<typeof drizzle<typeof schema>>;

let sqlClient: Sql | undefined;
let dbInstance: Database | undefined;

export function getSql(): Sql {
  if (!sqlClient) {
    sqlClient = postgres(getEnv().DATABASE_URL, {
      max: 10,
      // postgres.js emits NOTICE messages as warnings; silence them.
      onnotice: () => {},
    });
  }
  return sqlClient;
}

export function getDb(): Database {
  if (!dbInstance) {
    dbInstance = drizzle(getSql(), { schema });
  }
  return dbInstance;
}
