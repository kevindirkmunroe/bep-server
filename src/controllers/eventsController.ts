import { Request, Response } from "express";
import pool from '../db';

const SUPPORTED_PLATFORMS = ["funcheapsf", "visitoakland", "sfstation", "indybay"];

export const importUserEventFromFacebook = async( req: Request, resp: Response) => {
        const { facebookEventUrl } = req.body || {};

        if (!facebookEventUrl) {
            return resp.status(400).json({ error: "facebookEventUrl is required" });
        }

        const apifyToken = process.env.APIFY_TOKEN;

        const apifyRes = await fetch(
            `https://api.apify.com/v2/acts/crawlerbros~facebook-events-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    eventUrls: [facebookEventUrl]
                })
            }
        );

        if (!apifyRes.ok) {
            const text = await apifyRes.text();
            return resp.status(502).json({
                error: "Facebook import failed",
                detail: text
            });
        }

        const items = await apifyRes.json();
        const fbEvent = items?.[0];

        if (!fbEvent) {
            return resp.status(404).json({
                error: "No event data found for this Facebook URL"
            });
        }

        const importedEvent = {
            title: fbEvent.name || fbEvent.title || "",
            description: fbEvent.description || "",
            start_datetime: fbEvent.startDate || fbEvent.start_time || "",
            end_datetime: fbEvent.endDate || fbEvent.end_time || "",
            location_name: fbEvent.location?.name || fbEvent.place?.name || "",
            address: fbEvent.location?.address || fbEvent.address || "",
            website: facebookEventUrl,
            image_url: fbEvent.image || fbEvent.coverPhoto || ""
        };

    resp.json({ data: importedEvent, raw: fbEvent });
}

export const createUserEvent= async( req: Request, resp: Response) => {

    const userId = req.params.userId;
    const { title, description, start_datetime, end_datetime, location_name, address, price, image_url, tags, name, email, zip, category} = req.body;
    const client = await pool.connect();

    // Transaction creates event and published event...
    await client.query('BEGIN');

    const ts = new Date();

    try {
        const result = await client.query(`
                    INSERT INTO events (user_id, title, description, start_datetime, end_datetime, location_name, address, price,
                                       image_url, tags, created_at, updated_at, name, email, zip, category)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                    RETURNING event_id
            `,
            [userId, title, description, start_datetime, end_datetime, location_name, address, price, image_url, tags, ts, ts, name, email, zip, category]
        );

        const event_id = result.rows[0].event_id;

        for (const platform of SUPPORTED_PLATFORMS) {
            await client.query(`
                        INSERT INTO published_events (event_id, platform, status)
                        VALUES ($1, $2, 'not_started');
                `,
                [event_id, platform]
            );
        }

        await client.query("COMMIT");
        console.log("Event add complete ✅");

        resp.status(201).json({
            event_id: event_id
        })

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        resp.status(500).json({ error: "Failed to create event"});
    }finally {
        client.release();   // ✅ ALWAYS release
    }
}

export const cloneUserEvent = async( req: Request, resp: Response) => {
    const eventId = req.params.eventId;
    const {start_date} = req.body || {};
    const client = await pool.connect();
    await client.query('BEGIN');

    try{
        const result = await client.query(`
            INSERT INTO events (
                event_id,
                user_id,
                title,
                description,
                start_datetime,
                location_name,
                address,
                price,
                category,
                created_at,
                updated_at,
                image_url,
                tags,
                name,
                email,
                website,
                organization,
                phone, 
                zip
            )
            SELECT
                gen_random_uuid() as event_id,
                user_id,
                title || ' (Copy)',
                description,
                start_datetime,
                location_name,
                address,
                price,
                category,
                NOW(),
                NOW(),
                image_url,
                tags,
                name,
                email,
                website,
                organization,
                phone,
                zip
            FROM events
            WHERE event_id = $1
            RETURNING event_id;
            `,
            [eventId]
            ,
        );

        if(result.rowCount === 0){
            resp.status(400).json({error: "Event was not cloned."});
        }
        const cloneId = result.rows[0].event_id;

        for (const platform of SUPPORTED_PLATFORMS) {
            await client.query(`
                        INSERT INTO published_events (event_id, platform, status)
                        VALUES ($1, $2, 'not_started');
                `,
                [cloneId, platform]
            );
        }

        console.log(`[EventsController] clone new start date=${start_date}`);
        if(start_date){
            await client.query(
                `UPDATE events 
                SET start_datetime = $1
                WHERE event_id = $2`,
                [start_date, cloneId]
            )
        }

        await client.query("COMMIT");

        resp.status(201).json(result.rows[0]);
    }catch(err){
        await client.query('ROLLBACK');
        console.log(`cloning failed: ${err}`);
        return resp.status(500).json({err});
    }finally {
        client.release();   // ✅ ALWAYS release
    }
}

export const restoreUserEvent = async( req: Request, resp: Response) => {
    const eventId = req.params.eventId;
    const {start_date} = req.body;
    const client = await pool.connect();
    try {
        const result = await client.query(`
                    UPDATE events
                    SET start_datetime = $1,
                        updated_at = NOW()
                    WHERE event_id = $2 
                    RETURNING *
            `,
            [start_date, eventId]
            ,
        );

        if (result.rows.length === 0) {
            return resp.status(404).json({error: "Event not found"});
        }
        resp.status(200).json(result.rows[0]);
    }catch(err){
        console.error(err);
        resp.status(500).json({ error: "Failed to update event" });
    }
}

export const updateUserEvent = async( req: Request, resp: Response) => {
    const eventId = req.params.eventId;
    const fields = req.body;

    const keys = Object.keys(fields);
    const values = Object.values(fields);

    const setClause = keys
        .map((key, i) => `${key} = $${i + 1}`)
        .join(", ");

    const client = await pool.connect();

    try {
        const result = await client.query(`
                    UPDATE events
                    SET ${setClause},
                        updated_at = NOW()
                    WHERE event_id = $${keys.length + 1} RETURNING *
            `,
            [...values, eventId]
            ,
        );

        if (result.rows.length === 0) {
            return resp.status(404).json({error: "Event not found"});
        }
        resp.status(200).json(result.rows[0]);
    }catch(err){
        console.error(err);
        resp.status(500).json({ error: "Failed to update event" });
    }finally {
        client.release();   // ✅ ALWAYS release
    }
}

export const deleteUserEvent= async( req: Request, resp: Response) => {
    const eventId = req.params.eventId;
    const client = await pool.connect();

    try{
        await client.query(`
                DELETE FROM events where event_id = $1
        `,
            [eventId]
        );
        await client.query(`
                DELETE FROM published_events where event_id = $1
        `,
            [eventId]
        );

        resp.status(204).json({
            message: "Event deleted", data: req.body
        });
    }catch(err){
        console.error(err);
        resp.status(500).json({ error: "Failed to delete event" });
    }finally {
        client.release();   // ✅ ALWAYS release
    }
}

export const getUserEvents = async( req: Request, resp: Response) => {
    const userId = req.params.userId;
    if(!userId){
        return resp.status(400).json({
            "error": "user id is required"
        });
    }

    const query = `
        SELECT
            e.event_id,
            e.title,
            e.description,
            TO_CHAR(start_datetime, 'YYYY-MM-DD HH24:MI:SS') AS start_datetime,
            TO_CHAR(end_datetime, 'YYYY-MM-DD HH24:MI:SS') AS end_datetime,
            e.location_name,
            e.address,
            e.price,
            e.image_url,
            e.name,
            e.website,
            e.email,
            e.organization, 
            e.phone,
            e.category,
            e.zip,
            COALESCE(
                    json_agg(
                            json_build_object(
                                    'platform', p.platform,
                                    'status', p.status,
                                    'external_url', p.external_url,
                                    'date_published', p.date_published
                                )
                        ) FILTER (WHERE p.platform IS NOT NULL),
                    '[]'
                ) AS platforms
        FROM events e
                 LEFT JOIN published_events p
                           ON e.event_id = p.event_id
        WHERE e.user_id = $1
        GROUP BY e.event_id
        ORDER BY e.start_datetime ASC
    `
    const result = await pool.query(query, [
        userId
    ]);


    if (result.rows.length === 0) {
        return resp.status(404).json({
            error: `No events found for user id: ${userId}`,
        });
    }

    return resp.status(200).json({
        userId,
        count: result.rows.length,
        data: result.rows,
    });
};
