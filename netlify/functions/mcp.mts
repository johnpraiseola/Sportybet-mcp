
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import { loadConfig } from "../../src/config.js";
import { SportyBetClient } from "../../src/client.js";
import {
  sportybetBookBet,
  sportybetCalculateCombinedOdds,
  sportybetGetBookingStatus,
  sportybetGetFixtures,
  sportybetGetMarkets,
  sportybetGetOdds,
  sportybetSearchFixtures,
} from "../../src/tools.js";

export const config = {
  path: "/mcp",
  rateLimit: {
    windowSize: 60,
    windowLimit: 60,
    aggregateBy: ["ip"],
  },
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Use POST for MCP requests.", { status: 405 });
  }

  const token = process.env.MCP_BEARER_TOKEN;
  if (!token) {
    return new Response("Server token is not configured.", { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${token}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const appConfig = loadConfig();
  const client = new SportyBetClient(appConfig);

  const server = new McpServer({
    name: "sportybet",
    version: "1.0.0",
  });

  server.registerTool("sportybet_get_fixtures", {
    title: "Get upcoming SportyBet football fixtures",
    description: "Get upcoming Nigeria SportyBet football fixtures. Optional date (YYYY-MM-DD WAT), league and limit.",
    inputSchema: {
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      league: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(50),
    },
  }, (args) => sportybetGetFixtures(client, args, appConfig.tzOffsetMinutes));

  server.registerTool("sportybet_get_markets", {
    title: "Get SportyBet markets and odds",
    description: "Get available markets and outcomes for a SportyBet event ID.",
    inputSchema: { eventId: z.string().min(1) },
  }, (args) => sportybetGetMarkets(client, args));

  server.registerTool("sportybet_get_odds", {
    title: "Get current odds",
    description: "Get current odds for up to 50 SportyBet event IDs.",
    inputSchema: {
      eventIds: z.array(z.string().min(1)).min(1).max(50),
    },
  }, (args) => sportybetGetOdds(client, args));

  server.registerTool("sportybet_search_fixtures", {
    title: "Search SportyBet fixtures",
    description: "Search upcoming fixtures by team, league or country.",
    inputSchema: {
      query: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.number().int().min(1).max(500).default(50),
    },
  }, (args) => sportybetSearchFixtures(client, args, appConfig.tzOffsetMinutes));

  server.registerTool("sportybet_calculate_combined_odds", {
    title: "Calculate combined odds",
    description: "Multiply decimal odds together. This does not predict outcomes or guarantee winnings.",
    inputSchema: {
      selections: z.array(z.object({ odds: z.number().positive() })).min(1).max(20),
    },
  }, (args) => sportybetCalculateCombinedOdds(args));

  server.registerTool("sportybet_book_bet", {
    title: "Prepare a SportyBet booking code",
    description: "Validate selections and prepare a shareable booking code. NEVER places or stakes a wager.",
    inputSchema: {
      selections: z.array(z.object({
        eventId: z.string().min(1),
        marketId: z.string().min(1),
        outcomeId: z.string().min(1),
        specifier: z.string().nullish(),
        odds: z.number().positive().optional(),
      })).min(1).max(20),
    },
  }, (args) => sportybetBookBet(client, args));

  server.registerTool("sportybet_get_booking_status", {
    title: "Check a SportyBet booking code",
    description: "Read the details and status of a previously prepared booking code. Does not place a wager.",
    inputSchema: { bookingCode: z.string().min(4).max(12) },
  }, (args) => sportybetGetBookingStatus(client, args));

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    console.error("SportyBet MCP error:", error);
    return new Response("MCP request failed.", { status: 500 });
  }
}
