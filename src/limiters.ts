import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Request } from "express";

//
// 1. LOGIN LIMIT
// max 5 attempts / 15 min per IP
//
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    limit: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Too many login attempts. Try again in 15 minutes."
    }
});

//
// 2. REGISTER LIMIT
// max 3 account creations / hour per IP
//
export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Too many accounts created from this IP. Try again later."
    }
});

//
// 3. EVENT SUBMISSION LIMIT
// max 20 promotions / day per USER
//
export const promoteLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 1 day
    limit: 20,

    // IMPORTANT:
    // identify by logged-in user instead of IP
    keyGenerator: (req: Request) => {
        // Prefer userId
        if (req.body.userId) {
            return `user:${req.body.userId}`;
        }

        if (req.params.userId) {
            return `user:${req.params.userId}`;
        }

        // Safe IPv4/IPv6 fallback
        return ipKeyGenerator(req.toString());
    },

    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Daily promotion limit reached (20)."
    }
});
