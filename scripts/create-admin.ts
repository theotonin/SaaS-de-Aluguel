import { postgres } from "../packages/database/index.ts";
import { hashPassword } from "../apps/api/auth.ts";
import { email, password } from "../packages/contracts/index.ts";
const login = email.parse(process.env.ADMIN_EMAIL);
const secret = password.parse(process.env.ADMIN_PASSWORD);
if (!process.env.DATABASE_ADMIN_URL)
  throw new Error("Defina DATABASE_ADMIN_URL.");
const db = postgres(process.env.DATABASE_ADMIN_URL);
try {
  await db.query(
    "INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'superadmin')",
    ["Superadmin Tonin", login, await hashPassword(secret)],
  );
  console.log(
    "Superadmin criado. Remova ADMIN_PASSWORD do ambiente após o provisionamento.",
  );
} finally {
  await db.close();
}
