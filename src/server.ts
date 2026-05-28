import express from "express";
const session = require('express-session');

import cors from "cors";
import {
    cloneUserEvent,
    createUserEvent,
    deleteUserEvent,
    getUserEvents,
    updateUserEvent
} from "./controllers/eventsController";

import {
    checkUserLoggedIn,
    createUser, forgotPassword,
    getUser,
    getUserByEmail,
    loginUser,
    logoutUser,
    changeUserPassword,
    validateUser, requestInvite
} from "./controllers/usersController";

import {
    getPublishedEvent,
    getPublishedEvents,
    updatePublishedEventStatus,
    updatePublishedEvent
} from "./controllers/publishedEventsController";
import {mapRegion} from "./controllers/mappingController";
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
app.get("/users/me", checkUserLoggedIn);
app.post("/users/logout", logoutUser);

// Rate limiters
if(process.env.NODE_ENV !== 'development'){
    app.use("/users",registerLimiter);
    app.use("/users/login",loginLimiter);
    app.use("/events/:eventId/platforms/:platform",promoteLimiter);
}

// API
app.get("/users/validate", validateUser);
app.post("/users/invite", requestInvite);
app.post("/users/login", loginUser);
app.post("/users/logout", logoutUser);
app.post("/users/forgotpassword", forgotPassword);
app.post("/users/changepassword", changeUserPassword);
app.post("/users", createUser);
app.get("/users", requireAuth, getUserByEmail);
app.get("/users/:userId", requireAuth, getUser);

app.post("/users/:userId/events", requireAuth,createUserEvent);
app.get("/users/:userId/events", requireAuth,getUserEvents);
app.post("/events/:eventId/clone", requireAuth,cloneUserEvent);
app.put("/events/:eventId", requireAuth,updateUserEvent);
app.delete("/events/:eventId", requireAuth,deleteUserEvent);

app.patch("/events/:eventId", requireAuth,updatePublishedEventStatus);
app.patch("/events/:eventId/platforms/:platform", requireAuth,updatePublishedEvent);
app.get("/events/:eventId/platforms/:platform", requireAuth,getPublishedEvent);
app.get("/events/:eventId", requireAuth,getPublishedEvents);

app.get("/mapRegion", requireAuth,mapRegion);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
