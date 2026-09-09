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

export const getProOrders = async (req: Request, resp: Response) => {
    try {
        const result = await pool.query(`
            SELECT o.*, e.image, e.title, u.email
            FROM promote_orders o
                     left join events e on e.event_id = o.event_id
                     left join users u on u.user_id = e.user_id
            WHERE o.promote_selection  = 'PRO'
            ORDER BY o.created_at ASC
        `);
        resp.json(result.rows);

    } catch (error) {

        console.error(error);
        resp.status(500).json({
            error: "Unable to retrieve PRO orders"
        });
    }
}

export const fulfillProOrder = async (req: Request, resp: Response) => {
    const { order_id } = req.body;
    try {
        const result = await pool.query(`
            UPDATE promote_orders
            SET order_fulfilled_at = NOW()
            WHERE order_id = $1
        `,
            [order_id]);
        resp.json(result.rows);

    } catch (error) {

        console.error(error);
        resp.status(500).json({
            error: "Unable to update PRO orders"
        });
    }
}
