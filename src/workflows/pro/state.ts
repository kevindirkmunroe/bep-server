import { Annotation } from "@langchain/langgraph";

export type UserActionType = "complete" | "skip" | "report_error" | "close_all";

// 1. What the graph YIELDS to callers when interrupted (Outgoing)
export interface TaskInterruptValue {
    browserTaskId: string;
    platform: string;
    eventRunPlatformTaskId: string;
}
// 2. What Command({ resume: ... }) SENDS BACK into the node (Incoming)
export interface TaskResumePayload {
    action: UserActionType;
    externalEventUrl?: string;
    error?: {
        code?: string;
        message: string;
        domContext?: string;
    };
}

export interface PlatformItem {
    eventRunPlatformTaskId: string;
    platformName: string;
    executionOrder: number;
    status: "pending" | "in_progress" | "completed" | "failed" | "skipped" | "canceled";
    browserTaskId?: string;
    externalEventUrl?: string;
    error?: string;
    adaptedContent?: Record<string, any>;
}

export const EventRunState = Annotation.Root({
    eventId: Annotation<string>,
    runId: Annotation<string>,
    eventData: Annotation<Record<string, any>>,
    paymentVerified: Annotation<boolean>,
    isAborted: Annotation<boolean>({
        reducer: (_, update) => update,
        default: () => false,
    }),
    platforms: Annotation<PlatformItem[]>({
        reducer: (_, update) => update,
        default: () => [],
    }),
    currentPlatformIndex: Annotation<number | null>({
        reducer: (_, update) => update,
        default: () => null,
    }),
});

export type EventRunStateType = typeof EventRunState.State;
