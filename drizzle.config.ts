import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// One place to configure the database: DATABASE_URL in the ".env" file (copy ".env.example" to ".env").
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set. Copy ".env.example" to ".env" and put your PostgreSQL address in it.');
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url },
});
