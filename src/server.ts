import express from "express";
import cors from "cors";
import {
    createUserEvent,
    deleteUserEvent,
    getUserEvents,
    updateUserEvent
} from "./controllers/eventsController";

import {
    createUser,
    getUser,
    getUserByEmail, loginUser,
    validateUser
} from "./controllers/usersController";

import {
    getPublishedEvent,
    getPublishedEvents,
    updatePublishedEvent
} from "./controllers/publishedEventsController";
import {mapRegion} from "./controllers/mappingController";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/users/validate", validateUser);
app.post("/users/login", loginUser);
app.post("/users", createUser);
app.get("/users", getUserByEmail);
app.get("/users/:userId", getUser);

app.post("/users/:userId/events", createUserEvent);
app.get("/users/:userId/events", getUserEvents);
app.put("/events/:eventId", updateUserEvent);
app.delete("/events/:eventId", deleteUserEvent);

app.patch("/events/:eventId/platforms/:platform", updatePublishedEvent);
app.get("/events/:eventId/platforms/:platform", getPublishedEvent);
app.get("/events/:eventId", getPublishedEvents);

app.get("/mapRegion", mapRegion);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
