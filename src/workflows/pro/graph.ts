import { StateGraph, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Pool } from "pg";
import { EventRunState, EventRunStateType } from "./state";
import {
    fetchEvent,
    validatePayment,
    selectNextPlatform,
    adaptContentForPlatform,
    executeBrowserTaskAndInterrupt,
    completeRun,
} from "./nodes";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const checkpointer = new PostgresSaver(pool);

function routeAfterSelection(state: EventRunStateType) {
    return state.currentPlatformIndex !== null ? "adaptContent" : "completeRun";
}

function routeAfterPlatformExecution(state: EventRunStateType) {
    if (state.isAborted) {
        return "completeRun";
    }
    return "selectNextPlatform";
}

export const graph = new StateGraph(EventRunState)
    .addNode("fetchEvent", fetchEvent)
    .addNode("validatePayment", validatePayment)
    .addNode("selectNextPlatform", selectNextPlatform)
    .addNode("adaptContent", adaptContentForPlatform)
    .addNode("executeBrowserTask", executeBrowserTaskAndInterrupt)
    .addNode("completeRun", completeRun)

    .addEdge(START, "fetchEvent")
    .addEdge("fetchEvent", "validatePayment")
    .addEdge("validatePayment", "selectNextPlatform")
    .addConditionalEdges("selectNextPlatform", routeAfterSelection, {
        adaptContent: "adaptContent",
        completeRun: "completeRun",
    })
    .addEdge("adaptContent", "executeBrowserTask")
    // Sequential loop edge or early break
    .addConditionalEdges("executeBrowserTask", routeAfterPlatformExecution, {
        selectNextPlatform: "selectNextPlatform",
        completeRun: "completeRun",
    })
    .addEdge("completeRun", END)
    .compile({ checkpointer });
