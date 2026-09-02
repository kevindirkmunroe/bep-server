import { Request, Response } from "express";

import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const FRONTEND_URL = process.env.FRONTEND_URL;

export const checkout= async( req: Request, resp: Response) => {
    try {
        const { order_id, promote_selection } = req.body;

        const amount =
            promote_selection === "DIY"
                ? 1995
                : promote_selection === "PRO"
                    ? 2995
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
