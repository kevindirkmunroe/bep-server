import { Request, Response } from "express";
import pool from '../db';


function getOrderCost(order): number {
    switch (order.promote_selection) {
        case "DIY":
            return 1995;

        case "PRO":
            return 2995;

        default:
            throw new Error(
                `Invalid promote selection: ${order.promote_selection}`
            );
    }
}

export const checkout= async( req: Request, resp: Response) => {
    const { order } = req.body;
    try{
        let paymentResult = await pool.query(
            `
            SELECT *
            FROM stripe_payments
            WHERE order_id = $1
            LIMIT 1
            `,
            [order.order_id]
        );

        let payment = paymentResult.rows[0];

        if (!payment) {
            const checkoutSessionId = `cs_mock_${crypto.randomUUID()}`;
            const paymentIntentId = `pi_mock_${crypto.randomUUID()}`;

            paymentResult = await pool.query(
                `
                INSERT INTO stripe_payments (
                    order_id,
                    checkout_session_id,
                    payment_intent_id,
                    order_cost,
                    payment_status
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
                `,
                [
                    order.order_id,
                    checkoutSessionId,
                    paymentIntentId,
                    getOrderCost(order),
                    "succeeded"
                ]
            );

            payment = paymentResult.rows[0];
        }

        return resp.status(201).json({
            ok: true,
            checkoutSessionId: payment.checkout_session_id,
            paymentIntentId: payment.payment_intent_id,
            paymentStatus: "succeeded"
        });
    }catch(err){
        console.error(err);
        return resp.status(500).json({ error: "Failed to create Stripe payment" });
    }
}
