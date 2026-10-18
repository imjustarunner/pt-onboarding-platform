// Explicit operator bootstrap. Password is read from stdin, never arguments or logs.
// node src/scripts/auricwellOperator.js USERNAME NAME EMAIL < /secure/password-file
import fs from "node:fs";
import { createAccount } from "../services/auricwell/auth.js";
import { pool } from "../services/auricwell/repository.js";
const [username, name, email] = process.argv.slice(2);
try {
  if (!username || !name || !email || process.stdin.isTTY)
    throw new Error(
      "Supply username, quoted name, email, and a password through stdin.",
    );
  const password = fs.readFileSync(0, "utf8").trimEnd();
  const account = await createAccount({
    username,
    name,
    email,
    password,
    operator: true,
  });
  console.log(
    `AuricWell operator created: ${account.username}. Enroll MFA at /app.`,
  );
} catch (e) {
  console.error(
    e.status
      ? e.message
      : "Operator creation failed. Verify migration, configuration and unique username.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
