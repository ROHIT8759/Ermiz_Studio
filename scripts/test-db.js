/* eslint-disable @typescript-eslint/no-require-imports */
// CommonJS version to avoid ESM warnings without setting "type": "module"
// Uses DIRECT_URL from .env to test connectivity.
const { Client } = require("pg");
require("dotenv/config");

async function main() {
  const url = process.env.DIRECT_URL;
  if (!url) {
    throw new Error("DIRECT_URL is not set in the environment");
  }

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const { rows } = await client.query("select 1 as ok");
    console.log("DB connected, result:", rows);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("DB test failed:", err);
  process.exit(1);
});
