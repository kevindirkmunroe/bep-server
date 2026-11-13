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
