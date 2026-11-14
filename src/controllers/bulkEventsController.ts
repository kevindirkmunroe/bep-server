import {Request, Response} from "express";
import pool from "../db";
import {createOneEvent} from "./eventsController";

interface BulkInsertEventItem {
    [eventId: string]: any;
}

interface BulkInsertError {
    event: any;
    errorMessage: string;
}

interface BulkInsertResult {
    bulkInsertId?: string;
    events: BulkInsertEventItem[];
    errors: BulkInsertError[];
    duplicates: any[];
}

export const deleteEventsBulkList = async(req: Request, resp: Response) => {
    const client = await pool.connect();
    try {
        const { bulkInsertId, userId } = req.params;

        // Create transaction...
        await client.query('BEGIN');

        // 1. soft-delete batch_insert...
        const batchResult = await pool.query(
            `UPDATE bulk_insert
             SET deleted_at = NOW()
             WHERE bulk_insert_id = $1
               AND created_by = $2
               AND deleted_at IS NULL
             RETURNING deleted_at`,
            [bulkInsertId, userId]
        );

        if (batchResult.rowCount === 0) {
            throw new Error("Bulk insert not found or already deleted");
        }

        // 2. soft-delete associated events...
        const eventResult = await client.query(
            `UPDATE events e
         SET deleted_at = NOW()
         FROM bulk_insert_event bie
         WHERE e.event_id = bie.event_id
           AND bie.bulk_insert_id = $1
           AND e.deleted_at IS NULL`,
            [bulkInsertId]
        );

        // Complete Transaction
        await client.query('COMMIT');

        resp.status(200).json({
            bulk_insert_id: bulkInsertId,
            deleted_at: batchResult.rows[0].deleted_at,
            events_deleted: eventResult.rowCount
        });

    } catch (error) {
        console.error("Bulk import delete error:", error);
        resp.status(500).json({
            error: "Failed to delete bulk import"
        });
    }finally{
        client.release();   // ✅ ALWAYS release
    }
}

export const getUserEventsBulkList = async( req: Request, resp: Response) => {

    const {userId} = req.params;
    if(!userId){
        resp.status(400).json({error: "no User id found"});
    }

    try{
        const result = await pool.query(`
                SELECT
                bi.bulk_insert_id,
                bi.created_at,
                bi.deleted_at,
                bi.source,
                COUNT(bie.event_id)::INTEGER AS event_count
            FROM bulk_insert bi
            LEFT JOIN bulk_insert_event bie
                ON bie.bulk_insert_id = bi.bulk_insert_id
            WHERE bi.created_by = $1
            GROUP BY
                bi.bulk_insert_id
            HAVING COUNT(bie.event_id) > 0
            ORDER BY bi.created_at DESC
`, [userId]);
        return resp.status(200).json(result.rows);
    }catch(err){
        resp.status(400).json({err});
    }
}

export const createUserEventsBulk = async( req: Request, resp: Response) => {

    const userId = req.params.userId;
    if (!userId) {
        resp.status(401).json({
            error: "Not authenticated"
        });
        return;
    }

    const { events } = req.body;
    if(!events || events.length === 0){
        resp.status(500).json({
            error: "Zero events to save"
        });
        return;
    }

    const bulkInsertResult: BulkInsertResult =
        {   events: [],
            errors: [],
            duplicates: []
        };

    // Create transaction...
    const client = await pool.connect();
    await client.query('BEGIN');

    console.log(`[bulkEventsController] userId=${JSON.stringify(userId)}`);
    try{
        // Create Bulk Insert record...
        const result = await client.query(`
                    INSERT INTO bulk_insert (created_at, created_by)
                    VALUES (NOW(), $1)
                    RETURNING bulk_insert_id
            `,
            [userId]
        );

        if(!result){
            resp.status(500).json({ error: `Bulk Insert: failed to initialize.`});
            return;
        }

        bulkInsertResult.bulkInsertId = result.rows[0].bulk_insert_id;
        console.log(`[bulkEventsController] bulk_insert_id = ${bulkInsertResult.bulkInsertId}`);

        //
        // For each Event
        //   create Event
        //   associate Event with Bulk Insert
        //
        for (const e of events) {
            try{
                const eventId = await createOneEvent(userId as string, e, client);
                console.log(`[bulkEventsController] created eventId ${JSON.stringify(eventId)}`);

                // TODO: instead of all-or-nothing, return failed events while completing successful events.
                if(!eventId){
                    throw new Error(`Event ${e.title} could not be created`);
                }

                bulkInsertResult.events.push({[eventId]: e})

                console.log(`[bulkEventsController] insert bulkInsertId ${bulkInsertResult.bulkInsertId} eventId ${JSON.stringify(eventId)}`);
                client.query(`
                INSERT INTO bulk_insert_event (bulk_insert_id, event_id)
                VALUES ($1, $2)
            `, [bulkInsertResult.bulkInsertId, eventId]);
            }catch(error: Error | any){
                if(error.message.startsWith('Duplicate')){
                    bulkInsertResult.duplicates.push(e);
                }else{
                    bulkInsertResult.errors.push({event: e, errorMessage: error.message});
                }
            }
        }

        // Complete Transaction
        await client.query('COMMIT');

        resp.status(201).json({
            bulkInsertResult
        })

        // Return Bulk Insert record id, ids of all new records.
    }catch(err){
        await client.query('ROLLBACK');
        console.error(err);
        resp.status(500).json({ error: `Failed to Bulk Insert events: ${err}`});
    }finally{
        client.release();   // ✅ ALWAYS release
    }

}
