import express from "express";
const session = require('express-session');

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
import {mapZipToRegion} from "./controllers/mappingController";
import {loginLimiter, promoteLimiter, registerLimiter} from "./limiters";
import {requireAuth} from "./auth";

const app = express();
const PORT = process.env.PORT || 4000;

console.log(`Running in Environment: ${process.env.NODE_ENV}`);

app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
}));
app.use(express.json());

const isProd = process.env.NODE_ENV === "production";

app.set("trust proxy", isProd ? 1 : 0);

app.use(
    session({
        secret: process.env.SESSION_SECRET!,   // long random string
        resave: false,
        saveUninitialized: false,

        cookie: {
            httpOnly: true,      // JS cannot read it
            secure: isProd,
            sameSite: isProd ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        }
    })
);

// Session management
app.get("/api/users/me", checkUserLoggedIn);
app.post("/api/users/logout", logoutUser);

// Rate limiters
if(process.env.NODE_ENV !== 'development'){
    app.use("/api/users/register",registerLimiter);
    app.use("/api/users/login",loginLimiter);
    app.use("/api/events/:eventId/platforms/:platform",promoteLimiter);
}

// API
app.get("/api/users/validate", validateUser);
app.post("/api/users/invite", requestInvite);
app.post("/api/users/login", loginUser);
app.post("/api/users/logout", logoutUser);
app.post("/api/users/forgotpassword", forgotPassword);
app.post("/api/users/changepassword", changeUserPassword);
app.post("/api/users/register", createUser);
app.get("/api/users", requireAuth, getUserByEmail);
app.get("/api/users/:userId", requireAuth, getUser);

app.post("/api/users/:userId/events", requireAuth,createUserEvent);
app.get("/api/users/:userId/events", requireAuth,getUserEvents);
app.post("/api/events/:eventId/clone", requireAuth,cloneUserEvent);
app.patch("/api/events/:eventId/restore", requireAuth,restoreUserEvent);
app.put("/api/events/:eventId", requireAuth,updateUserEvent);
app.delete("/api/events/:eventId", requireAuth,deleteUserEvent);

app.patch("/api/events/:eventId", requireAuth,updatePublishedEventStatus);
app.patch("/api/events/:eventId/platforms/:platform", requireAuth,updatePublishedEvent);
app.get("/api/events/:eventId/platforms/:platform", requireAuth,getPublishedEvent);
app.get("/api/events/:eventId", requireAuth,getPublishedEvents);

app.post("/api/mapRegion", mapZipToRegion);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
