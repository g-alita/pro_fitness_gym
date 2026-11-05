const serverless = require("serverless-http");
const { app, connectToMongoDB } = require("./server");

const expressHandler = serverless(app);
const frontendOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const method = event.requestContext?.http?.method || event.httpMethod;
  if (method === "OPTIONS") {
    return expressHandler(event, context);
  }

  try {
    await connectToMongoDB();
  } catch (error) {
    console.error("MongoDB connection failed for Lambda invocation:", error.message);
    const requestOrigin = event.headers?.origin || event.headers?.Origin;
    const corsHeaders = requestOrigin && frontendOrigins.includes(requestOrigin)
      ? {
          "access-control-allow-origin": requestOrigin,
          "access-control-allow-credentials": "true",
          vary: "Origin"
        }
      : {};
    return {
      statusCode: 503,
      headers: { "content-type": "application/json", ...corsHeaders },
      body: JSON.stringify({
        success: false,
        message: "Database is temporarily unavailable. Please try again later."
      })
    };
  }

  return expressHandler(event, context);
};
