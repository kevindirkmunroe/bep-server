import { interrupt } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {EventRunStateType, TaskInterruptValue, TaskResumePayload} from "./state";
import pool from "../../db";

const gemini = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash",
    temperature: 0.1,
});

export async function fetchEvent(state: EventRunStateType) {
    const client = await pool.connect();

    const result = await client.query<any>(`SELECT *FROM events WHERE id = $1`, [state.eventId]);
    if (!result || result.rowCount === 0) throw new Error(`Event not found: ${state.eventId}`);
    const event = result.rows[0];

    const rPlatforms = await client.query<any>(
        `SELECT id as "eventRunPlatformTaskId", platform_name as "platformName", execution_order as "executionOrder", status 
     FROM event_run_platform_tasks 
     WHERE event_run_id = $1 
     ORDER BY execution_order ASC`,
        [state.runId]
    );

    const platforms = (rPlatforms ? rPlatforms.rows[0] : []);

    return {
        eventData: event,
        platforms: platforms.map((p: any) => ({ ...p, status: "pending" as const })),
    };
}

export async function validatePayment(state: EventRunStateType) {
    const client = await pool.connect();
    const result = await client.query<any>(`SELECT is_pro FROM events WHERE id = $1`, [state.eventId]);
    const row = result.rows[0];
    if (!row?.is_pro) {
        throw new Error(`Unauthorized: Event ${state.eventId} is not verified as a PRO event.`);
    }
    return { paymentVerified: true };
}

export function selectNextPlatform(state: EventRunStateType) {
    if (state.isAborted) {
        return { currentPlatformIndex: null };
    }
    const nextIndex = state.platforms.findIndex((p) => p.status === "pending");
    return {
        currentPlatformIndex: nextIndex !== -1 ? nextIndex : null,
    };
}

export async function adaptContentForPlatform(state: EventRunStateType) {
    const idx = state.currentPlatformIndex!;
    const target = state.platforms[idx];
    const client = await pool.connect();

    // Adapt canonical schema to specific platform constraints (length, formatting, tags)
    const prompt = `Adapt the following event for platform "${target.platformName}".
Strictly return a JSON object with keys: { "title", "description", "tags", "locationString", "ticketInstructions" }.
Source Event: ${JSON.stringify(state.eventData)}`;

    const response = await gemini.invoke(prompt);
    let adapted = state.eventData;
    try {
        const raw = String(response.content).replace(/```json/g, "").replace(/```/g, "").trim();
        adapted = JSON.parse(raw);
    } catch {
        adapted = state.eventData;
    }

    const updatedPlatforms = [...state.platforms];
    updatedPlatforms[idx] = {
        ...target,
        status: "in_progress",
        adaptedContent: adapted,
    };

    // Sync state to platform queue table
    await client.query(
        `UPDATE event_run_platform_tasks SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
        [target.eventRunPlatformTaskId]
    );

    return { platforms: updatedPlatforms };
}

export async function executeBrowserTaskAndInterrupt(state: EventRunStateType) {
    const idx = state.currentPlatformIndex!;
    const target = state.platforms[idx];
    const client = await pool.connect();

    // 1. Insert row into browser_task
    const result = await client.query<{ id: string }>(
        `INSERT INTO browser_task (
       event_id, event_run_id, event_run_platform_task_id, status, payload, created_at, updated_at
     ) VALUES ($1, $2, $3, 'pending', $4, NOW(), NOW())
     RETURNING id`,
        [
            state.eventId,
            state.runId,
            target.eventRunPlatformTaskId,
            JSON.stringify(target.adaptedContent || state.eventData),
        ]
    );
    const createdTask = result.rows[0];

    // 2. Suspend graph execution. Yields payload to callers.
    const resume = interrupt<TaskInterruptValue, TaskResumePayload>({
        browserTaskId: createdTask.id,
        platform: target.platformName,
        eventRunPlatformTaskId: target.eventRunPlatformTaskId,
    });

    const updatedPlatforms = [...state.platforms];

    // 3. Process the action returned by Command(resume)
    switch (resume.action) {
        case "close_all": {
            for (let i = idx; i < updatedPlatforms.length; i++) {
                if (updatedPlatforms[i].status === "pending" || i === idx) {
                    updatedPlatforms[i] = { ...updatedPlatforms[i], status: "canceled" };
                    await client.query(
                        `UPDATE event_run_platform_tasks SET status = 'canceled', updated_at = NOW() WHERE id = $1`,
                        [updatedPlatforms[i].eventRunPlatformTaskId]
                    );
                }
            }
            return { platforms: updatedPlatforms, isAborted: true };
        }

        case "report_error": {
            const errMessage = resume.error?.message || "User reported error";
            updatedPlatforms[idx] = {
                ...target,
                browserTaskId: createdTask.id,
                status: "failed",
                error: errMessage,
            };
            await client.query(
                `UPDATE event_run_platform_tasks SET status = 'failed', updated_at = NOW() WHERE id = $1`,
                [target.eventRunPlatformTaskId]
            );
            return { platforms: updatedPlatforms };
        }

        case "skip": {
            updatedPlatforms[idx] = {
                ...target,
                browserTaskId: createdTask.id,
                status: "skipped",
            };
            await client.query(
                `UPDATE event_run_platform_tasks SET status = 'skipped', updated_at = NOW() WHERE id = $1`,
                [target.eventRunPlatformTaskId]
            );
            return { platforms: updatedPlatforms };
        }

        case "complete":
        default: {
            updatedPlatforms[idx] = {
                ...target,
                browserTaskId: createdTask.id,
                status: "completed",
                externalEventUrl: resume.externalEventUrl,
            };
            await client.query(
                `UPDATE event_run_platform_tasks SET status = 'completed', updated_at = NOW() WHERE id = $1`,
                [target.eventRunPlatformTaskId]
            );
            return { platforms: updatedPlatforms };
        }
    }
}

export async function completeRun(state: EventRunStateType) {
    const client = await pool.connect();
    const finalStatus = state.isAborted ? "aborted" : "completed";
    await client.query(
        `UPDATE event_runs SET status = $1, updated_at = NOW() WHERE id = $2`,
        [finalStatus, state.runId]
    );
    return {};
}
