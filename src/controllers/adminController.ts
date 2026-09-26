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

export const updateFulfillmentLog = async (req: Request, resp: Response) => {
    const {event_id, order_id, worker_user_id} = req.body;

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // record/update the individual platform fulfillment
        await client.query(`
            INSERT INTO fulfillment_log (
                order_id,
                worker_user_id
            )
            VALUES ($1, $2)
                ON CONFLICT (order_id, worker_user_id)
                DO UPDATE SET
                last_updated_at = NOW();
        `,
            [order_id, worker_user_id]);

        // determine whether anything remains
        const result = await client.query(
            `
        SELECT COUNT(*)::int AS remaining
        FROM published_events
        WHERE event_id = $1
          AND status != 'submitted'
        `,
            [event_id]
        );

        if (result.rows[0].remaining === 0) {
            await client.query(
                `
            UPDATE promote_orders
            SET
                order_fulfilled_at = NOW(),
                order_fulfilled_by = $1
            WHERE order_id = $2
              AND order_fulfilled_at IS NULL
            `,
                [worker_user_id, order_id]
            );
        }

        await client.query("COMMIT");
        resp.json(result.rows);

    } catch (error) {
        await client.query("ROLLBACK");

        console.error(error);
        resp.status(500).json({
            error: "Unable to update fulfillment log"
        });
    } finally {
        client.release();
    }
}
