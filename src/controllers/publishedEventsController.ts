import { Request, Response } from "express";
import pool from '../db';


export const updatePublishedEventStatus = async( req: Request, resp: Response) => {
    const eventId = req.params.eventId;
    const { status } = req.body;
    try{
        const result = await pool.query(
            `
        UPDATE published_events
            SET status = $1
            WHERE event_id = $2
        `,
            [status, eventId]
        )
        return resp.json({
            success: true
        })

    }catch(err: Error | any){
        return resp.status(500).json({ error: err.message });
    }
}

export const getEventURLFromTrackingCode = async( req: Request, resp: Response) => {
        const { trackingCode } = req.params;

        const result = await pool.query(
            `
            SELECT
                pe.published_event_id,
                pe.external_url
            FROM published_events pe
            WHERE pe.tracking_code = $1
        `,
            [trackingCode]
        );

        console.log(`[publishedEventsController] code=${trackingCode} result=${JSON.stringify(result.rows[0])}`);
        if (result.rowCount === 0) {
            return resp.status(404).send("Link not found");
        }

        const {
            published_event_id,
            external_url
        } = result.rows[0];

        await pool.query(
            `
            INSERT INTO tracking_clicks (published_event_id)
            VALUES ($1)
        `,
            [published_event_id]
        );

        return resp.redirect(302, external_url);
}

export const getEventClickCount = async( req: Request, resp: Response) => {
    const { trackingCode } = req.params;

    const result = await pool.query(
        `
            SELECT
                pe.published_event_id
            FROM published_events pe
            WHERE pe.tracking_code = $1
        `,
        [trackingCode]
    );

    console.log(`[publishedEventsController] count:code=${trackingCode} result=${JSON.stringify(result.rows[0])}`);
    if (result.rowCount === 0) {
        return resp.status(404).send("Link not found");
    }
    const publishedEventId = result.rows[0].published_event_id;

    const countResult = await pool.query(
        `
            SELECT count(*)
            FROM tracking_clicks t
            WHERE t.published_event_id = $1
        `,
        [publishedEventId]
    );

    const count = countResult.rowCount === 0 ? 0 : countResult.rows[0].count;
    return resp.status(200).json({count});
}


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

export const getPublishedEventPlatforms = async (req: Request, resp: Response) => {
    const { eventId } = req.params;
    const client = await pool.connect();

    try {
        const eventRes = await client.query(
            `SELECT             
                                e.event_id,
                                e.title,
                                e.description,
                                TO_CHAR(start_datetime, 'YYYY-MM-DD HH24:MI:SS') AS start_datetime,
                                TO_CHAR(end_datetime, 'YYYY-MM-DD HH24:MI:SS') AS end_datetime,
                                e.location_name,
                                e.address,
                                e.price,
                                e.image,
                                e.name,
                                e.website,
                                e.email,
                                e.organization,
                                e.phone,
                                e.category,
                                e.zip FROM events e WHERE event_id = $1`,
            [eventId]
        );

        const platformRes = await client.query(
            `SELECT
                                    pe.*,
                                    COUNT(tc.click_id)::int AS click_count
                                FROM published_events pe
                                LEFT JOIN tracking_clicks tc
                                    ON tc.published_event_id = pe.published_event_id
                                WHERE pe.event_id = $1
                                GROUP BY pe.published_event_id;`,
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
