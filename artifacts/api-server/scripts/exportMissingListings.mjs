import pg from "pg";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Get all MLS listing IDs from the seed that need to be checked
const seedPath = join(__dirname, "../src/lib/seeds/clickEventsSeed.json");
const seed = JSON.parse(readFileSync(seedPath, "utf8"));

// Unique MLS IDs from all seed rows
const allMlsIds = [...new Set(seed.map(r => r.mlsListingId).filter(Boolean))];
console.log("Total unique MLS IDs in seed:", allMlsIds.length);

// Fetch all these listings from the local DB (dev)
const BATCH = 50;
const results = [];

for (let i = 0; i < allMlsIds.length; i += BATCH) {
  const batch = allMlsIds.slice(i, i + BATCH);
  const placeholders = batch.map((_, j) => `$${j + 1}`).join(",");
  const { rows } = await pool.query(
    `SELECT
       id::text, mls_listing_id, list_agent_mls_id, list_agent_name,
       list_agent_email, list_agent_phone, address, city, state, zip,
       price_usd, beds, baths, sqft, lot_acres, year_built,
       status, mls_status,
       mls_modification_timestamp, mls_list_date,
       mls_human_id, mls_brokerage_name, mode,
       created_at, updated_at
     FROM listings
     WHERE mls_listing_id = ANY($1::text[])
       AND purged_at IS NULL`,
    [batch]
  );
  results.push(...rows);
}

console.log("Listings fetched from local DB:", results.length);

const outPath = join(__dirname, "../src/lib/seeds/missingListingsSeed.json");
writeFileSync(outPath, JSON.stringify(results, null, 0), "utf8");
console.log("Written to:", outPath);

await pool.end();
