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

const ALL_PLATFORM_CLICKS = `
            select json_agg(t) from 
              ( SELECT
                pe.platform,
                COUNT(tc.published_event_id)::int AS click_count,
                ROUND(
                    COUNT(tc.published_event_id) * 100.0 /
                    NULLIF(SUM(COUNT(tc.published_event_id)) OVER (), 0),
                    1
                ) AS click_percentage
            FROM published_events pe
            LEFT JOIN tracking_clicks tc
                ON tc.published_event_id = pe.published_event_id
            GROUP BY pe.platform
            ORDER BY click_count DESC) t;
`;

const PLATFORM_CLICKS_BY_USER = `
            select json_agg(t) from 
              (SELECT
                    pe.platform,
                    COUNT(tc.published_event_id)::int AS click_count,
                    ROUND(
                        COUNT(tc.published_event_id) * 100.0 /
                        NULLIF(
                            SUM(COUNT(tc.published_event_id)) OVER (),
                            0
                        ),
                        1
                    ) AS click_percentage
                FROM published_events pe
                JOIN events e
                    ON e.event_id = pe.event_id
                LEFT JOIN tracking_clicks tc
                    ON tc.published_event_id = pe.published_event_id
                WHERE e.user_id = $1
                GROUP BY pe.platform
                ORDER BY click_count DESC) t;
        
`;
export const getPlatformClicks = async (req: Request, resp: Response) => {
    const { user_id } = req.params;

    try {
        let result = null;
        if(user_id){
            result = await pool.query(PLATFORM_CLICKS_BY_USER, [user_id]);
        }else{
            result = await pool.query(ALL_PLATFORM_CLICKS);
        }

        resp.json(result.rows[0].json_agg);

    } catch (error) {

        console.error(error);
        resp.status(500).json({
            error: "Unable to retrieve clicks"
        });
    }
}

export const getProOrders = async (req: Request, resp: Response) => {
    try {
        const result = await pool.query(`
            SELECT o.*, e.image, e.title, u.first_name, u.last_name, u.email
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
