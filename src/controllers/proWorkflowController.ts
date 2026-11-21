import {Request, Response} from "express";
import pool from '../db';
import { graph } from "../workflows/pro/graph";
import {Command} from "@langchain/langgraph";

// 1. Triggered by Scheduler/EventRunManager
export const startProEventRuns = async (req: Request, resp: Response) => {
        const { eventId } = req.body;
        const runId = `run_${eventId}_${Date.now()}`;
        const client = await pool.connect();

    // Initialize event_runs and target platform items
        await client.query(`INSERT INTO event_runs (id, event_id, status) VALUES ($1, $2, 'running')`, [runId, eventId]);
        // Example: Populate 3 platform queue targets
        const platforms = ["eventbrite", "meetup", "luma"];
        for (let i = 0; i < platforms.length; i++) {
            await client.query(
                `INSERT INTO event_run_platform_tasks (event_run_id, event_id, platform_name, execution_order)
       VALUES ($1, $2, $3, $4)`,
                [runId, eventId, platforms[i], i + 1]
            );
        }
        // Kick off workflow (stops at first interrupt)
        graph.invoke({ eventId, runId }, { configurable: { thread_id: runId } });
        resp.json({ success: true, runId });
}

// 2. Polled by React App: Atomically claim oldest pending task using FOR UPDATE SKIP LOCKED
export const pollProTasks = async (req: Request, resp: Response) => {
    const { runId } = req.query;
    const client = await pool.connect();

    const result = await client.query(
        `UPDATE browser_task
     SET status = 'claimed', updated_at = NOW()
     WHERE id = (
       SELECT bt.id
       FROM browser_task bt
       WHERE bt.event_run_id = $1 AND bt.status = 'pending'
       ORDER BY bt.created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
        [runId]
    );
    const claimedTask = result.rows[0];
    resp.json({ task: claimedTask || null });
}

// 3. Action API: Handles Complete, Skip, Report Error, Close All
export const handleProUserAction = async (req: Request, resp: Response) => {
    const { id } = req.params;
    const { action, externalEventUrl, error } = req.body;
    const client = await pool.connect();

    const result = await client.query(
        `UPDATE browser_task 
     SET status = $1, result = $2, updated_at = NOW() 
     WHERE id = $3 
     RETURNING event_run_id`,
        [action === "complete" ? "completed" : action, JSON.stringify({ externalEventUrl, error }), id]
    );
    const task = result.rows[0];

    if (!task) return resp.status(404).json({ error: "Task not found" });
    // Resume the suspended thread with the action payload
    const nextState = await graph.invoke(
        new Command({
            resume: { action, externalEventUrl, error },
        }),
        {
            configurable: { thread_id: task.event_run_id },
        }
    );
    resp.json({ success: true, nextState });
}
