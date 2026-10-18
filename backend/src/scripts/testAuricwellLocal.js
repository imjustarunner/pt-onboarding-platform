// Native, disposable MySQL validation. Never starts or modifies an installed service.
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { installSharedClientTestSchema } from "../services/auricwell/testing/sharedSchema.js";

const backend = fileURLToPath(new URL("../../", import.meta.url));
const candidates = [
  process.env.AURICWELL_MYSQLD,
  ...String(process.env.PATH || "")
    .split(path.delimiter)
    .map((p) => path.join(p, "mysqld")),
  "/opt/homebrew/opt/mysql@8.0/bin/mysqld",
  "/opt/homebrew/opt/mysql/bin/mysqld",
  "/usr/local/mysql/bin/mysqld",
].filter(Boolean);
let binary;
for (const candidate of candidates) {
  try {
    await fs.access(candidate, fs.constants.X_OK);
    binary = candidate;
    break;
  } catch {
    /* Try the next installed binary. */
  }
}
if (!binary)
  throw new Error(
    "Install native MySQL or set AURICWELL_MYSQLD to its mysqld executable. Docker is not required.",
  );
if (Number(process.versions.node.split(".")[0]) < 22)
  throw new Error("AuricWell PDF validation requires Node 22 or newer.");

const directory = await fs.mkdtemp("/tmp/aw-mysql-");
await fs.chmod(directory, 0o700);
const socketPath = path.join(directory, "mysql.sock");
const logPath = path.join(directory, "mysql.log");
let server,
  activeChild,
  interrupted = false;
const stop = () => {
  interrupted = true;
  activeChild?.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
async function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: backend,
    stdio: "inherit",
    timeout: 180000,
    ...options,
  });
  activeChild = child;
  const [code, signal] = await once(child, "exit");
  activeChild = null;
  if (code !== 0)
    throw new Error(`Validation command failed (${signal || code}).`);
  if (interrupted) throw new Error("Validation interrupted.");
}
try {
  console.log(
    "Creating a temporary native MySQL database for synthetic AuricWell tests.",
  );
  await run(binary, ["--no-defaults", "--version"]);
  await run(binary, [
    "--no-defaults",
    "--initialize-insecure",
    `--datadir=${directory}/data`,
    `--log-error=${logPath}`,
  ]);
  server = spawn(
    binary,
    [
      "--no-defaults",
      `--datadir=${directory}/data`,
      `--socket=${socketPath}`,
      `--pid-file=${directory}/mysql.pid`,
      `--log-error=${logPath}`,
      "--bind-address=127.0.0.1",
      "--port=33471",
      "--mysqlx=0",
      "--skip-log-bin",
      "--innodb-buffer-pool-size=67108864",
      "--innodb-redo-log-capacity=67108864",
    ],
    { stdio: "ignore" },
  );
  let serverError;
  server.on("error", (error) => {
    serverError = error;
  });
  let db;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (interrupted) throw new Error("Validation interrupted.");
    if (serverError || server.exitCode !== null)
      throw new Error(
        "Temporary MySQL could not start. Check whether local port 33471 is already in use.",
      );
    try {
      db = await mysql.createConnection({
        socketPath,
        user: "root",
        multipleStatements: true,
        connectTimeout: 500,
      });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!db) throw new Error("Temporary MySQL startup timed out.");
  try {
    // The unique socket proves this is the server just created, not a project database.
    await db.query("CREATE DATABASE auricwell_test");
    await db.query(
      "CREATE USER 'auricwell_test'@'127.0.0.1' IDENTIFIED BY 'auricwell-test-only'",
    );
    await db.query(
      "CREATE USER 'auricwell_test'@'localhost' IDENTIFIED BY 'auricwell-test-only'",
    );
    await db.query(
      "GRANT ALL ON auricwell_test.* TO 'auricwell_test'@'127.0.0.1'",
    );
    await db.query(
      "GRANT ALL ON auricwell_test.* TO 'auricwell_test'@'localhost'",
    );
    await db.query("USE auricwell_test");
    await installSharedClientTestSchema(db);
    await db.query(
      await fs.readFile(
        path.join(backend, "../database/migrations/1495_auricwell_product.sql"),
        "utf8",
      ),
    );
    await db.query(
      await fs.readFile(
        path.join(
          backend,
          "../database/migrations/1509_auricwell_shared_clients.sql",
        ),
        "utf8",
      ),
    );
    await db.query(
      await fs.readFile(
        path.join(
          backend,
          "../database/migrations/1510_auricwell_shared_staff.sql",
        ),
        "utf8",
      ),
    );
    for (const migration of [
      "1511_product_scoped_staff_identities.sql",
      "1512_auricwell_shared_appointments.sql",
      "1619_auricwell_session_integrations.sql",
      "1620_auricwell_client_messaging.sql",
    ])
      await db.query(
        await fs.readFile(
          path.join(backend, "../database/migrations", migration),
          "utf8",
        ),
      );
  } finally {
    await db.end();
  }
  console.log(
    "Checking the native import worker against an empty synthetic queue.",
  );
  await run(process.execPath, ["src/scripts/auricwellImportWorker.js"], {
    timeout: 30000,
    env: {
      ...process.env,
      NODE_ENV: "test",
      SKIP_DB_CONNECT: "1",
      DB_HOST: "127.0.0.1",
      DB_PORT: "33471",
      DB_NAME: "auricwell_test",
      DB_USER: "auricwell_test",
      DB_PASSWORD: "auricwell-test-only",
      CLINICAL_DB_HOST: "127.0.0.1",
      CLINICAL_DB_PORT: "33471",
      CLINICAL_DB_NAME: "auricwell_test",
      CLINICAL_DB_USER: "auricwell_test",
      CLINICAL_DB_PASSWORD: "auricwell-test-only",
      FAMILY_BILLING_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString(
        "base64",
      ),
    },
  });
  const testDirectory = path.join(backend, "src/services/auricwell");
  const tests = (await fs.readdir(testDirectory))
    .filter((f) => f.endsWith(".test.js"))
    .sort()
    .map((f) => path.join(testDirectory, f));
  await run(process.execPath, ["--test", "--test-force-exit", ...tests], {
    env: { ...process.env, AURICWELL_TEST_DATABASE: "local-disposable", NODE_ENV: "test", SKIP_DB_CONNECT: "1",
      DB_HOST: "127.0.0.1", DB_PORT: "33471", DB_NAME: "auricwell_test", DB_USER: "auricwell_test", DB_PASSWORD: "auricwell-test-only",
      CLINICAL_DB_HOST: "127.0.0.1", CLINICAL_DB_PORT: "33471", CLINICAL_DB_NAME: "auricwell_test", CLINICAL_DB_USER: "auricwell_test", CLINICAL_DB_PASSWORD: "auricwell-test-only",
      FAMILY_BILLING_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString("base64") },
  });
} catch (error) {
  console.error(error.message);
  const log = await fs.readFile(logPath, "utf8").catch(() => "");
  if (log) console.error(log.split("\n").slice(-12).join("\n"));
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null && server.pid) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 10000);
    await exited;
    clearTimeout(timer);
  }
  await fs.rm(directory, { recursive: true, force: true });
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  console.log("Temporary MySQL stopped and its synthetic data removed.");
}
