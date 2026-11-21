dotenv.config();
const model = new OpenAI({ openAIApiKey: process.env.OPENAI_API_KEY });

const workflow = new Graph();
// Node 1: Generate a question
workflow.addNode("generate_question", async (state) => {
    const result = await model.call("Suggest a creative writing prompt.");
    return { ...state, question: result };
});
// Node 2: Answer the question
workflow.addNode("answer_question", async (state) => {
    const result = await model.call(`Answer: ${state.question}`);
    return { ...state, answer: result };
});
// Define execution flow
workflow.addEdge("generate_question", "answer_question");
// Execute the flow
const executor = workflow.compile();
const result = await executor.invoke({});
console.log("Final Result:", result);
