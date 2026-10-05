// Native, disposable MySQL validation. Never starts or modifies an installed service.
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const backend = fileURLToPath(new URL("../../", import.meta.url));
const candidates = [
  process.env.RECORDS_MYSQLD,
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
    "Install native MySQL or set RECORDS_MYSQLD to its mysqld executable. Docker is not required.",
  );
if (Number(process.versions.node.split(".")[0]) < 22)
  throw new Error("Records requests PDF validation requires Node 22 or newer.");

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
    "Creating a temporary native MySQL database for synthetic Records requests tests.",
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
      "--port=33473",
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
        "Temporary MySQL could not start. Check whether local port 33473 is already in use.",
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
    await db.query("CREATE DATABASE records_requests_test");
    await db.query(
      "CREATE USER 'records_requests_test'@'127.0.0.1' IDENTIFIED BY 'records-test-only'",
    );
    await db.query(
      "CREATE USER 'records_requests_test'@'localhost' IDENTIFIED BY 'records-test-only'",
    );
    await db.query(
      "GRANT ALL ON records_requests_test.* TO 'records_requests_test'@'127.0.0.1'",
    );
    await db.query(
      "GRANT ALL ON records_requests_test.* TO 'records_requests_test'@'localhost'",
    );
    await db.query("USE records_requests_test");
    await db.query(await fs.readFile(path.join(backend, 'src/services/recordsRequests/testing.sql'), 'utf8'));
    await db.query(await fs.readFile(path.join(backend, '../database/migrations/1540_auricwell_records_requests.sql'), 'utf8'));

  } finally {
    await db.end();
  }
  const testDirectory = path.join(backend, "src/services/recordsRequests");
  const tests = (await fs.readdir(testDirectory))
    .filter((f) => f.endsWith(".test.js"))
    .sort()
    .map((f) => path.join(testDirectory, f));
  await run(process.execPath, ["--test", ...tests], {
    env: { ...process.env, RECORDS_TEST_DATABASE: "local-disposable", SKIP_DB_CONNECT: "1", DB_HOST: "127.0.0.1", DB_PORT: "33473", DB_NAME: "records_requests_test", DB_USER: "records_requests_test", DB_PASSWORD: "records-test-only", FAMILY_BILLING_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString("base64") },
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
