import { Request, Response } from "express";
import pool from '../db';

export const createOrder= async( req: Request, resp: Response) => {
    const {promote_selection, event_id } = req.body;
    try {

        const result = await pool.query(
            `
            INSERT INTO promote_orders (
                promote_selection,
                event_id,
                created_at
            )
            VALUES ($1, $2, NOW())
            RETURNING *
            `,
            [
                promote_selection,
                event_id
            ]
        );
        return resp.status(201).json(result.rows[0]);
    }catch(err){
        console.error(err);
        return resp.status(500).json({ error: "Failed to create Order" });
    }
}

export const updateOrder= async( req: Request, resp: Response) => {
    const orderId = req.params.orderId;
    const {promote_selection, payment_completed_at, order_fulfilled_at } = req.body;
    try {

        const result = await pool.query(
            `
            UPDATE promote_orders
                SET promote_selection = $1,
                payment_completed_at = $2,
                order_fulfilled_at = $3
            WHERE order_id = $4
            `,
            [ promote_selection, payment_completed_at, order_fulfilled_at, orderId ]
        );
        return resp.status(201).json(result.rows[0]);
    }catch(err){
        console.error(err);
        return resp.status(500).json({ error: "Failed to update Order" });
    }
}

export const getOrderForEvent = async( req: Request, resp: Response) => {
    const eventId = req.params.eventId;
    const result = await pool.query(
        `
        SELECT *
        FROM promote_orders
        WHERE event_id = $1
        `,
        [eventId]
    );

    return result.rows.length
        ? resp.status(201).json(result.rows[0])
        : resp.status(404).json({});
}
