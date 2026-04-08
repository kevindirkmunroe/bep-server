import {Pool} from "pg";

export const pool = new Pool({
    user: "kevinmunroe",
    host: "localhost",
    database: "bayarea_event_publisher",
    password: "",
    port: 5432,
});
