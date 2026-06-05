import express from "express";
const session = require("express-session");

import cors from "cors";
import {
    cloneUserEvent,
    createUserEvent,
    deleteUserEvent,
    getUserEvents,
    restoreUserEvent,
    updateUserEvent
} from "./controllers/eventsController";

import {
    checkUserLoggedIn,
    createUser,
    forgotPassword,
    getUser,
    getUserByEmail,
    loginUser,
    logoutUser,
    changeUserPassword,
    validateUser,
    requestInvite
} from "./controllers/usersController";

import {
    getPublishedEvent,
    getPublishedEvents,
    updatePublishedEventStatus,
    updatePublishedEvent
} from "./controllers/publishedEventsController";
import {mapZipToCity, mapZipToRegion} from "./controllers/mappingController";
import { loginLimiter, promoteLimiter, registerLimiter } from "./limiters";
import { requireAuth } from "./auth";
import pool from "./db";

const app = express();

const allowedOrigins = [
    "http://localhost:4150",
    "http://localhost:5173",
    "https://localbuzz-events-feed.onrender.com",
    process.env.FRONTEND_URL
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS blocked origin: ${origin}`));
        }
    },
    credentials: true
}));
app.use(express.json());

const isProd = process.env.NODE_ENV === "production";

app.set("trust proxy", isProd ? 1 : 0);

app.use(
    session({
        secret: process.env.SESSION_SECRET!,
        resave: false,
        saveUninitialized: false,

        cookie: {
            httpOnly: true,
            secure: isProd,
            sameSite: isProd ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
    })
);

// Session management
app.get("/users/me", checkUserLoggedIn);
app.post("/users/logout", logoutUser);
app.get("/events/public", async (req, res) => {
    const result = await pool.query(`
    SELECT
      event_id,
      title,
      description,
      start_datetime,
      location_name,
      address,
      category,
      price,
      website
    FROM events
    ORDER BY start_datetime ASC
  `);

    res.json({ data: result.rows });
});

// Rate limiters
if (process.env.NODE_ENV !== "development") {
    app.use("/users/register", registerLimiter);
    app.use("/users/login", loginLimiter);
    app.use("/events/:eventId/platforms/:platform", promoteLimiter);
}

// API
app.get("/users/validate", validateUser);
app.post("/users/invite", requestInvite);
app.post("/users/login", loginUser);
app.post("/users/logout", logoutUser);
app.post("/users/forgotpassword", forgotPassword);
app.post("/users/changepassword", changeUserPassword);
app.post("/users/register", createUser);
app.get("/users", requireAuth, getUserByEmail);
app.get("/users/:userId", requireAuth, getUser);

app.post("/users/:userId/events", requireAuth, createUserEvent);
app.get("/users/:userId/events", requireAuth, getUserEvents);
app.post("/events/:eventId/clone", requireAuth, cloneUserEvent);
app.patch("/events/:eventId/restore", requireAuth, restoreUserEvent);
app.put("/events/:eventId", requireAuth, updateUserEvent);
app.delete("/events/:eventId", requireAuth, deleteUserEvent);

app.patch("/events/:eventId", requireAuth, updatePublishedEventStatus);
app.patch("/events/:eventId/platforms/:platform", requireAuth, updatePublishedEvent);
app.get("/events/:eventId/platforms/:platform", requireAuth, getPublishedEvent);
app.get("/events/:eventId", requireAuth, getPublishedEvents);

app.get("/mapRegion", mapZipToRegion);
app.get("/mapCity", mapZipToCity);


export default app;
