import { ChatGoogle } from "@langchain/google";
import { StateGraph, MessagesAnnotation, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// 1. Define a custom tool
const getWeather = tool(
    async ({ city }) => {
        return `The weather in ${city} is 72°F and sunny.`;
    },
    {
        name: "get_weather",
        description: "Get the current weather for a given city.",
        schema: z.object({
            city: z.string().describe("The city name"),
        }),
    }
);

const tools = [getWeather];
const toolNode = new ToolNode(tools);

// 2. Initialize Gemini with your API key and bind tools
const model = new ChatGoogle({
    model: "gemini-3.7-flash", // Or newer models like "gemini-3.7-flash"
    apiKey: process.env.GOOGLE_API_KEY, // Optional if GOOGLE_API_KEY is set in env
    temperature: 0,
}).bindTools(tools);

// 3. Define graph nodes and routing logic
async function callModel(state: typeof MessagesAnnotation.State) {
    const response = await model.invoke(state.messages);
    return { messages: [response] };
}

function shouldContinue(state: typeof MessagesAnnotation.State) {
    const lastMessage = state.messages[state.messages.length - 1];
    if ("tool_calls" in lastMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
        return "tools";
    }
    return END;
}

// 4. Build and compile the StateGraph
const workflow = new StateGraph(MessagesAnnotation)
    .addNode("agent", callModel)
    .addNode("tools", toolNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent");

const app = workflow.compile();

// 5. Run the graph
async function main() {
    const result = await app.invoke({
        messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
    });

    console.log(result.messages[result.messages.length - 1].content);
}

main();
