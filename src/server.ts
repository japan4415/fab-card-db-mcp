import { McpServer } from "@modelcontextprotocol/server";
import { registerGetCardDetailTool } from "./tools/card-detail";
import { registerGetFabCardPrintsTool } from "./tools/prints";
import { registerGetFabProductsTool } from "./tools/products";
import { registerSearchFabCardsTool } from "./tools/search";

// MCP サーバーファクトリ
export function createServer(): McpServer {
	const server = new McpServer({
		name: "Flesh and Blood Card Search API",
		version: "2.0.0",
	});

	registerSearchFabCardsTool(server);
	registerGetFabCardPrintsTool(server);
	registerGetCardDetailTool(server);
	registerGetFabProductsTool(server);

	return server;
}
