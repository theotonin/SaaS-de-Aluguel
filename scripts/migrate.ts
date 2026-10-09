import { readFile } from "node:fs/promises";
import { postgres } from "../packages/database/index.ts";
if (!process.env.DATABASE_ADMIN_URL)
  throw new Error("Defina DATABASE_ADMIN_URL para o proprietário do schema.");
const db = postgres(process.env.DATABASE_ADMIN_URL);
try {
  await db.transaction(async (sql) => {
    await sql.query("SELECT pg_advisory_xact_lock(867431)");
    await sql.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    if (
      (await sql.query("SELECT version FROM schema_migrations WHERE version=1"))
        .rows.length
    ) {
      console.log("Migration 001 já aplicada.");
      return;
    }
    await sql.query(
      await readFile(
        new URL("../packages/database/schema.sql", import.meta.url),
        "utf8",
      ),
    );
    await sql.query("INSERT INTO schema_migrations(version) VALUES(1)");
    console.log(
      "Migration 001 aplicada. Configure a senha e LOGIN do papel loca_runtime fora do Git.",
    );
  });
} finally {
  await db.close();
}
