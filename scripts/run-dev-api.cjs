#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const dotenv = require("dotenv");

const repoRoot = path.resolve(__dirname, "..");
const backendEnvPath = path.join(repoRoot, ".env.backend");

if (fs.existsSync(backendEnvPath)) {
  const loaded = dotenv.config({ path: backendEnvPath });
  if (loaded.error) {
    console.error("Failed to load .env.backend:", loaded.error.message);
    process.exit(1);
  }
}

const hasConnectionString =
  Boolean(process.env.ConnectionStrings__DefaultConnection) ||
  Boolean(process.env.DATABASE_URL);

if (!hasConnectionString) {
  console.error(
    "Missing DB config: set ConnectionStrings__DefaultConnection or DATABASE_URL in .env.backend",
  );
}

const childEnv = { ...process.env };
if (process.platform !== "win32") {
  const dotnetDir = path.join(process.env.HOME ?? "", ".dotnet");
  if (dotnetDir && fs.existsSync(dotnetDir)) {
    const sep = path.delimiter;
    childEnv.PATH = `${dotnetDir}${sep}${childEnv.PATH ?? ""}`;
  }
}

const child = spawn(
  "dotnet",
  ["watch", "--project", "src/BarberFlow.API", "run", "--launch-profile", "https"],
  {
    cwd: repoRoot,
    env: childEnv,
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
