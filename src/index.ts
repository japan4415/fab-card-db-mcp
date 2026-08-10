import { createMcpHandler } from "agents/mcp/server";
import { createServer } from "./server";

// ステートレス MCP ハンドラー
const mcpHandler = createMcpHandler(() => createServer(), {
	route: "/mcp",
	allowedOriginHostnames: "*",
	corsOptions: {
		methods: "POST, OPTIONS",
		headers: "Content-Type, Accept, MCP-Protocol-Version, MCP-Method, MCP-Name",
	},
});

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Well-known MCP manifest
		if (url.pathname === "/.well-known/mcp.json") {
			if (request.method !== "GET" && request.method !== "HEAD") {
				return new Response(null, {
					status: 405,
					headers: { Allow: "GET, HEAD" },
				});
			}

			const origin = url.origin;
			const manifest = {
				name: "Flesh and Blood Card Search API",
				version: "2.0.0",
				description:
					"A Model Context Protocol server that provides card search, print variation listings, product catalogs, and detailed information for the Flesh and Blood Trading Card Game database.",
				endpoints: {
					rpc: { url: `${origin}/mcp` },
				},
			};

			return new Response(
				request.method === "HEAD" ? null : JSON.stringify(manifest, null, 2),
				{
					status: 200,
					headers: {
						"content-type": "application/json; charset=utf-8",
						"cache-control": "public, max-age=300",
					},
				},
			);
		}

		// MCP Streamable HTTP endpoint
		if (url.pathname === "/mcp") {
			return mcpHandler(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
