import {Pool} from "pg";
import 'dotenv/config';

// Retrieve the URL from an environment variable for security
const connectionString = process.env.DATABASE_URL;
if (!process.env.DATABASE_URL) {
    throw new Error("❌ DATABASE_URL is not set");
}
const pool = new Pool({
    connectionString: connectionString
});

console.log("🟢 Connected to DB:", process.env.DATABASE_URL?.split("@")[1]);

export default pool;
