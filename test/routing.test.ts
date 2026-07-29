/**
 * HTTP routing tests.
 *
 * Verifies that the worker's fetch handler routes requests correctly
 * and returns appropriate status codes for all endpoints.
 */
import { describe, expect, it } from "vitest";
import { rawRequest } from "./helpers";

describe("HTTP routing", () => {
	// ───────────────────────────────────────
	// /.well-known/mcp.json
	// ───────────────────────────────────────
	describe("GET /.well-known/mcp.json", () => {
		it("returns 200 with JSON manifest", async () => {
			const response = await rawRequest("http://localhost/.well-known/mcp.json");
			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toContain("application/json");

			const manifest = (await response.json()) as Record<string, unknown>;
			expect(manifest.name).toBe("Flesh and Blood Card Search API");
			expect(manifest.version).toBe("2.0.0");
			expect(manifest.description).toBeDefined();
		});

		it("contains rpc endpoint but not SSE endpoint", async () => {
			const response = await rawRequest("http://localhost/.well-known/mcp.json");
			const manifest = (await response.json()) as {
				endpoints: {
					rpc?: { url: string };
					sse?: unknown;
					sseMessage?: unknown;
				};
			};

			// Must have rpc endpoint
			expect(manifest.endpoints).toBeDefined();
			expect(manifest.endpoints.rpc).toBeDefined();
			expect(manifest.endpoints.rpc!.url).toContain("/mcp");

			// Must NOT have SSE endpoint
			expect(manifest.endpoints.sse).toBeUndefined();
			expect(manifest.endpoints.sseMessage).toBeUndefined();

			// Also verify manifest text doesn't reference /sse paths
			const manifestText = JSON.stringify(manifest);
			expect(manifestText).not.toContain("/sse");
		});

		it("HEAD returns 200 with no body", async () => {
			const response = await rawRequest("http://localhost/.well-known/mcp.json", {
				method: "HEAD",
			});
			expect(response.status).toBe(200);

			const body = await response.text();
			expect(body).toBe("");
		});

		it("POST returns 405 Method Not Allowed", async () => {
			const response = await rawRequest("http://localhost/.well-known/mcp.json", {
				method: "POST",
			});
			expect(response.status).toBe(405);
			expect(response.headers.get("allow")).toContain("GET");
		});

		it("DELETE returns 405 Method Not Allowed", async () => {
			const response = await rawRequest("http://localhost/.well-known/mcp.json", {
				method: "DELETE",
			});
			expect(response.status).toBe(405);
		});
	});

	// ───────────────────────────────────────
	// /mcp endpoint method restrictions
	// ───────────────────────────────────────
	describe("/mcp method restrictions", () => {
		it("GET returns 405 Method Not Allowed", async () => {
			const response = await rawRequest("http://localhost/mcp", {
				method: "GET",
				headers: {
					Accept: "application/json, text/event-stream",
				},
			});
			expect(response.status).toBe(405);
		});

		it("DELETE returns 405 Method Not Allowed", async () => {
			const response = await rawRequest("http://localhost/mcp", {
				method: "DELETE",
				headers: {
					Accept: "application/json, text/event-stream",
				},
			});
			expect(response.status).toBe(405);
		});
	});

	// ───────────────────────────────────────
	// Legacy SSE endpoints must not exist
	// ───────────────────────────────────────
	describe("legacy SSE endpoints removed", () => {
		it("GET /sse returns 404", async () => {
			const response = await rawRequest("http://localhost/sse");
			expect(response.status).toBe(404);
		});

		it("POST /sse returns 404", async () => {
			const response = await rawRequest("http://localhost/sse", {
				method: "POST",
			});
			expect(response.status).toBe(404);
		});

		it("GET /sse/message returns 404", async () => {
			const response = await rawRequest("http://localhost/sse/message");
			expect(response.status).toBe(404);
		});

		it("POST /sse/message returns 404", async () => {
			const response = await rawRequest("http://localhost/sse/message", {
				method: "POST",
			});
			expect(response.status).toBe(404);
		});
	});

	// ───────────────────────────────────────
	// CORS: external Origin headers must not be rejected
	// ───────────────────────────────────────
	describe("CORS origin validation", () => {
		it("POST /mcp with Origin: https://claude.ai is not rejected as 403", async () => {
			const response = await rawRequest("http://localhost/mcp", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json, text/event-stream",
					Origin: "https://claude.ai",
					"MCP-Protocol-Version": "2026-07-28",
					"MCP-Method": "initialize",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
					params: {
						_meta: {
							"io.modelcontextprotocol/protocolVersion": "2026-07-28",
							"io.modelcontextprotocol/clientCapabilities": {},
						},
						protocolVersion: "2026-07-28",
						capabilities: {},
						clientInfo: { name: "test-client", version: "1.0.0" },
					},
				}),
			});
			expect(response.status).not.toBe(403);
		});

		it("OPTIONS /mcp with Origin: https://claude.ai returns CORS headers", async () => {
			const response = await rawRequest("http://localhost/mcp", {
				method: "OPTIONS",
				headers: {
					Origin: "https://claude.ai",
				},
			});
			expect(response.status).not.toBe(403);
			expect(response.headers.get("access-control-allow-origin")).toBe("*");
		});
	});

	// ───────────────────────────────────────
	// Unmatched paths
	// ───────────────────────────────────────
	describe("unmatched paths", () => {
		it("/ returns 404", async () => {
			const response = await rawRequest("http://localhost/");
			expect(response.status).toBe(404);
		});

		it("/unknown returns 404", async () => {
			const response = await rawRequest("http://localhost/unknown");
			expect(response.status).toBe(404);
		});

		it("/api/v1/cards returns 404", async () => {
			const response = await rawRequest("http://localhost/api/v1/cards");
			expect(response.status).toBe(404);
		});
	});
});
