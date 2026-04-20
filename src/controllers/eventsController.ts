import { Request, Response } from "express";
import pool from '../db';

const SUPPORTED_PLATFORMS = ["funcheapsf", "visitoakland"];

export const createUserEvent= async( req: Request, resp: Response) => {

    const userId = req.params.userId;
    const { title, description, start_datetime, end_datetime, location_name, address, price, image_url, tags, name, email} = req.body;
    const client = await pool.connect();

    // Transaction creates event and published event...
    await client.query('BEGIN');

    const ts = new Date();

    try {
        const result = await client.query(`
                    INSERT INTO events (user_id, title, description, start_datetime, end_datetime, location_name, address, price,
                                       image_url, tags, created_at, updated_at, name, email)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    RETURNING event_id
            `,
            [userId, title, description, start_datetime, end_datetime, location_name, address, price, image_url, tags, ts, ts, name, email]
        );

        const event_id = result.rows[0].event_id;

        for (const platform of SUPPORTED_PLATFORMS) {
            await client.query(`
                        INSERT INTO published_events (event_id, platform, status, name)
                        VALUES ($1, $2, 'not_started', $3);
                `,
                [event_id, platform, name]
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
            e.start_datetime,
            e.end_datetime,
            e.location_name,
            e.address,
            e.price,
            e.image_url,
            e.name,
            e.website,
            e.email,
            e.organization, 
            e.phone,
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
        ORDER BY e.created_at DESC
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
