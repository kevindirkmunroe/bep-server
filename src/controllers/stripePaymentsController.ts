import { Request, Response } from "express";

import Stripe from "stripe";
import pool from "../db";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const FRONTEND_URL = process.env.FRONTEND_URL;

export const checkout = async( req: Request, resp: Response) => {
    try {
        const { order_id, promote_selection } = req.body;

        const amount =
            promote_selection === "DIY"
                ? 150
                : promote_selection === "PRO"
                    ? 100
                    : null;

        if (!amount) {
            return resp.status(400).json({
                error: "Invalid promote selection"
            });
        }

        const session = await stripe.checkout.sessions.create({
            mode: "payment",

            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name:
                                promote_selection === "DIY"
                                    ? "Airhorn.events Self-Service"
                                    : "Airhorn.events Pro Service"
                        },
                        unit_amount: amount
                    },
                    quantity: 1
                }
            ],

            success_url:
                `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,

            cancel_url:
                `${FRONTEND_URL}/payment-cancelled`,

            metadata: {
                order_id: String(order_id),
                promote_selection
            }
        });

        resp.json({
            url: session.url
        });

    } catch (error) {
        console.error(error);
        resp.status(500).json({
            error: "Unable to create Stripe checkout session"
        });
    }
}

export const verifyPayment = async( req: Request, resp: Response) => {

    const client = await pool.connect();

    try {
        const { sessionId } = req.body;
        const session =
            await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== "paid") {
            return resp.status(400).json({
                ok: false,
                paymentStatus: session.payment_status
            });
        }

        const orderId = session.metadata?.order_id;

        if (!orderId) {
            return resp.status(400).json({
                error: "Stripe session has no order_id"
            });
        }

        await client.query(
            `
            UPDATE stripe_payments
            SET payment_status = 'succeeded',
                payment_intent_id = $1,
                updated_at = NOW()
            WHERE order_id = $2
            `,
            [
                session.payment_intent,
                orderId
            ]
        );

        await client.query(
            `
            UPDATE promote_orders
            SET payment_completed_at = COALESCE(
                payment_completed_at,
                NOW()
            )
            WHERE order_id = $1
            `,
            [orderId]
        );

        resp.json({
            ok: true,
            orderId
        });

    } catch (err) {
        console.error(err);

        resp.status(500).json({
            error: "Unable to verify Stripe payment"
        });
    }finally {
        client.release();   // ✅ ALWAYS release
    }
};
