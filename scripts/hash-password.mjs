import { randomBytes, scryptSync } from "node:crypto";

// Mirrors lib/auth/password.ts. Prints a `salt:hash` value for
// ADMIN_PASSWORD_HASH in .env. Usage: npm run hash-password -- <password>

const password = process.argv[2];
if (!password) {
  console.error("Usage: npm run hash-password -- <password>");
  process.exit(1);
}

const salt = randomBytes(16);
const derived = scryptSync(password, salt, 64);
console.log(`${salt.toString("hex")}:${derived.toString("hex")}`);
