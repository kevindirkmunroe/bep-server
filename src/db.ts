import {Pool} from "pg";
import 'dotenv/config';

// Retrieve the URL from an environment variable for security
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString
});

export default pool;
