import {Pool} from "pg";

const pool = new Pool({
    user: "kevinmunroe",
    host: "localhost",
    database: "bayarea_event_publisher",
    password: "",
    port: 5432,
});

export default pool;
