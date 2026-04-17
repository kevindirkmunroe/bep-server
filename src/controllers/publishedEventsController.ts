import { Request, Response } from "express";
import pool from '../db';

export const updatePublishedEvent = async( req: Request, resp: Response) => {
    const eventId = req.params.eventId;
    const platform = req.params.platform;

    const { external_url, status, payload } = req.body;
    try{
        const result = await pool.query(
            `
        UPDATE published_events
            SET
              status = COALESCE($1, status),
              external_url = COALESCE($2, external_url),
              date_published = CASE 
                WHEN $1 = 'submitted' THEN NOW()
                ELSE date_published
              END,
              updated_at = NOW(),
              payload = COALESCE($5, payload)
            WHERE event_id = $3
            AND platform = $4;
        `,
            [status, external_url, eventId, platform, payload]
        )
        console.log("[PublishedEventController] rows updated:", result.rowCount);
        return resp.json({
            success: true
        })

    }catch(err: Error | any){
        return resp.status(500).json({ error: err.message });
    }
}

export const getPublishedEvent = async( req: Request, resp: Response) => {
    const eventId = req.params.eventId;
    const platform = req.params.platform;

    try {
        const result = await pool.query(
            `SELECT *
             from published_events
             WHERE event_id = $1
               AND platform = $2
            `,
            [eventId, platform]
        );
        if (result.rows.length === 0) {
            return resp.status(404).json({
                error: `Event ${eventId} not found for platform \"${platform}\"`,
            });
        }

        return resp.json({
            eventId,
            count: result.rows.length,
            data: result.rows,
        });
    }catch(err){
        console.error(err);
        resp.status(500).json({ error: "Failed to fetch platform data" });
    }
}

export const getPublishedEvents = async (req: Request, resp: Response) => {
    const { eventId } = req.params;
    const client = await pool.connect();

    try {
        const eventRes = await client.query(
            `SELECT * FROM events WHERE event_id = $1`,
            [eventId]
        );

        const platformRes = await client.query(
            `SELECT platform, status, external_url, date_published
               FROM published_events
               WHERE event_id = $1
               ORDER BY platform`,
            [eventId]
        );

        resp.json({
            ...eventRes.rows[0],
            platforms: platformRes.rows
        });
    } catch (err) {
        console.error(err);
        resp.status(500).json({ error: "Failed to fetch event platforms" });
    }finally {
        client.release();   // ✅ ALWAYS release
    }
};
