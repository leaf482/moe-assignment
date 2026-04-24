import type { APIGatewayProxyResult } from "aws-lambda";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Marketplace-Signature",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

export function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };
}

export function parseBody<T>(body: string | null): T {
  if (!body) {
    throw new Error("Request body is required");
  }
  return JSON.parse(body) as T;
}
