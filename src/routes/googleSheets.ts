import { Router, Request, Response } from "express";
import { google } from "googleapis";
import crypto from "node:crypto";
import {SessionData} from "express-session";

const googleSheetsRouter = Router();
const SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly"
];


let FRONTEND_URL: (string|undefined) = undefined;

function createOAuthClient() {
    FRONTEND_URL = process.env.FRONTEND_URL!;

    const redirectUri = process.env.GOOGLE_REDIRECT_URI!;
    if (!redirectUri) {
        throw new Error("GOOGLE_REDIRECT_URI is not configured");
    }

    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
    );
}

/**
 * GET /api/google/auth
 *
 * Redirects user to Google's OAuth consent screen.
 */
googleSheetsRouter.get("/auth", (req, res) => {
    const state = crypto.randomBytes(32).toString("hex");

    (req.session as SessionData).googleOAuthState = state;
    const returnTo = req.query.returnTo;

    // Accept only relative paths within Airhorn
    (req.session as SessionData).googleReturnTo =
        typeof returnTo === "string" &&
        returnTo.startsWith("/") &&
        !returnTo.startsWith("//") &&
        !returnTo.includes("\\")
            ? returnTo
            : "/";

    const client = createOAuthClient();

    const url = client.generateAuthUrl({
        access_type: "online",
        scope: SCOPES,
        state
    });

    req.session.save((err) => {
        if (err) {
            console.error("Session save failed:", err);
            res.sendStatus(500);
            return;
        }

        res.redirect(url);
    });
});

/**
 * GET /api/google/callback
 *
 * Google redirects here after authorization.
 */

googleSheetsRouter.get("/callback", async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        res.status(400).send("Google authorization denied");
        return;
    }

    if (
        typeof code !== "string" ||
        typeof state !== "string" ||
        state !== (req.session as SessionData).googleOAuthState
    ) {
        res.status(400).send("Invalid OAuth response");
        return;
    }

    delete (req.session as SessionData).googleOAuthState;

    try {
        const client = createOAuthClient();

        const { tokens } = await client.getToken(code);

        if (!tokens.access_token) {
            res.status(401).send("No access token received");
            return;
        }

        // Store temporary access token in server-side session
        (req.session as SessionData).googleSheetsToken = tokens.access_token;

        req.session.save((err) => {
            if (err) {
                console.error("Session save failed:", err);
                res.sendStatus(500);
                return;
            }

            // Make redirect URl...
            const frontendUrl = process.env.FRONTEND_URL!;
            const returnTo = (req.session as SessionData).googleReturnTo || "/";
            delete (req.session as SessionData).googleReturnTo;
            const redirectUrl = new URL(returnTo, frontendUrl);
            redirectUrl.searchParams.set("googleSheets", "connected");

            res.redirect(redirectUrl.toString());
        });

    } catch (err) {
        console.error("Google OAuth failed:", err);
        res.status(500).send("Google authorization failed");
    }
});

googleSheetsRouter.get("/status", (req, res) => {
    res.json({
        connected: Boolean((req.session as SessionData).googleSheetsToken)
    });
});

export interface GoogleSheetsResponse {
    spreadsheetId: string;
    mappings: string[][];
    defaults: string[][];
    eventSheets: {
        eventsTab: string;
        eventYear: number;
        events: string[][];
    }[];
}

function extractSpreadsheetId(sheetUrl: string): string {
    const url = new URL(sheetUrl);

    if (
        url.protocol !== "https:" ||
        url.hostname !== "docs.google.com"
    ) {
        throw new Error("Invalid Google Sheets URL");
    }

    const match = url.pathname.match(
        /^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/
    );

    if (!match) {
        throw new Error("Spreadsheet ID not found");
    }

    return match[1];
}


googleSheetsRouter.get("/read", async (req: Request, res: Response) => {
    const token = (req.session as SessionData).googleSheetsToken;
    const sheetUrl = req.query.sheetUrl;

    if (!token) {
        res.status(401).json({
            error: "Google authorization required"
        });
        return;
    }

    if (typeof sheetUrl !== "string") {
        res.status(400).json({
            error: "Google Sheets URL required"
        });
        return;
    }

    let spreadsheetId: string;

    try {
        spreadsheetId = extractSpreadsheetId(sheetUrl);
    } catch {
        res.status(400).json({
            error: "Invalid Google Sheets URL"
        });
        return;
    }

    try {
        const auth = createOAuthClient();

        auth.setCredentials({
            access_token: token
        });

        const sheets = google.sheets({
            version: "v4",
            auth
        });

        //
        // 1. Retrieve all tab names
        //
        const metadata = await sheets.spreadsheets.get({
            spreadsheetId,
            fields: "sheets.properties.title"
        });

        const titles = (metadata.data.sheets ?? [])
            .map(sheet => sheet.properties?.title)
            .filter((title): title is string => Boolean(title));

        //
        // 2. Find all Events tabs for current year or newer
        //
        const currentYear = new Date().getFullYear();

        const eventTabs = titles
            .map(title => {
                const match = title.match(
                    /^(?:Events[\s_-]+)?(\d{4})$/i
                );

                return match
                    ? {
                        title,
                        year: Number(match[1])
                    }
                    : null;
            })
            .filter(
                (tab): tab is { title: string; year: number } =>
                    tab !== null && tab.year >= currentYear
            )
            .sort((a, b) =>
                a.year - b.year || a.title.localeCompare(b.title)
            );

        if (eventTabs.length === 0) {
            res.status(400).json({
                error: `No Events tabs found for ${currentYear} or newer`
            });
            return;
        }

        //
        // 3. Build ranges for Mappings, Defaults, and all Events tabs
        //
        const quoteSheet = (name: string) =>
            `'${name.replace(/'/g, "''")}'`;

        const ranges = [
            "'Airhorn.Mappings'!A:Z",
            "'Airhorn.Defaults'!A:Z",
            ...eventTabs.map(tab =>
                `${quoteSheet(tab.title)}!A:Z`
            )
        ];

        //
        // 4. Read all ranges in one API request
        //
        const response = await sheets.spreadsheets.values.batchGet({
            spreadsheetId,
            ranges,
            valueRenderOption: "FORMATTED_VALUE"
        });

        const valueRanges = response.data.valueRanges ?? [];

        const mappings = valueRanges[0]?.values ?? [];
        const defaults = valueRanges[1]?.values ?? [];

        //
        // 5. Build eventSheets, preserving each tab's year
        //
        const eventSheets = eventTabs.map((tab, index) => ({
            eventsTab: tab.title,
            eventYear: tab.year,
            events: valueRanges[index + 2]?.values ?? []
        }));

        //
        // 6. Return all event sheets
        //
        const result: GoogleSheetsResponse = {
            spreadsheetId,
            mappings,
            defaults,
            eventSheets
        };

        res.json(result);

    } catch (err: any) {
        console.error("Google Sheets read error:", err.message);

        const status = err.response?.status;

        if (status === 401) {
            res.status(401).json({
                error: "Google authorization expired. Please reconnect."
            });
            return;
        }

        if (status === 403) {
            res.status(403).json({
                error: "Google account cannot access this spreadsheet."
            });
            return;
        }

        if (status === 404) {
            res.status(404).json({
                error: "Spreadsheet not found."
            });
            return;
        }

        res.status(500).json({
            error: "Unable to read Google Sheet. Check sheet contains Defaults, Mappings, and Events <Year> tabs."
        });
    }
});


export default googleSheetsRouter;
