import { Request, Response } from "express";

import pool from '../db';

export const getInviteRequests = async (req: Request, resp: Response) => {
    try {
        const result = await pool.query(`
            SELECT request_id, name, email, status, invite_code, requested_at
            FROM invite_requests
            ORDER BY requested_at ASC
        `);

        resp.json(result.rows);

    } catch (error) {

        console.error(error);
        resp.status(500).json({
            error: "Unable to retrieve invite requests"
        });
    }
}
