/**
 * Protocol negative tests.
 *
 * Pins down spec-conformant behaviors verified by live probing of the
 * deployed worker. These are intentional behaviors, not bugs:
 *
 * - `ping` does not exist in the MCP 2026-07-28 revision (removed from
 *   the spec), so a modern-era ping MUST be rejected with -32601.
 * - A legacy-era (2025-03-26) ping is still answered by the SDK with
 *   an automatic empty-result pong.
 * - Header/body mismatches, malformed payloads, and invalid tool inputs
 *   are rejected with the JSON-RPC error codes mandated by the spec.
 *
 * IMPORTANT: These tests encode the specification. If one fails, the
 * implementation regressed — do not weaken the assertion.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mcpModernRequest, parseJsonRpcBody, parseModernResult, rawRequest } from "./helpers";

// Mock axios to prevent real network calls
vi.mock("axios", () => {
	const mockGet = vi.fn();
	return {
		default: {
			get: mockGet,
			isAxiosError: (error: unknown): boolean => {
				return typeof error === "object" && error !== null && "_isAxiosError" in error;
			},
		},
		get: mockGet,
		isAxiosError: (error: unknown): boolean => {
			return typeof error === "object" && error !== null && "_isAxiosError" in error;
		},
	};
});

const MODERN_HEADERS: Record<string, string> = {
	"Content-Type": "application/json",
	Accept: "application/json, text/event-stream",
	"MCP-Protocol-Version": "2026-07-28",
};

const META_ENVELOPE = {
	"io.modelcontextprotocol/protocolVersion": "2026-07-28",
	"io.modelcontextprotocol/clientCapabilities": {},
};

beforeEach(async () => {
	const axios = await import("axios");
	vi.mocked(axios.default.get).mockReset();
});

// ─────────────────────────────────────────────────
// ping removal in the 2026-07-28 revision
// ─────────────────────────────────────────────────
describe("ping", () => {
	it("modern era (2026-07-28): ping is rejected with 404 + -32601 (removed from spec)", async () => {
		const response = await mcpModernRequest("ping");

		expect(response.status).toBe(404);
		const body = (await parseJsonRpcBody(response)) as {
			error?: { code?: number };
		};
		expect(body.error?.code).toBe(-32601);
	});

	it("legacy era (2025-03-26): ping is answered with 200 + {} (SDK auto-pong)", async () => {
		const response = await rawRequest("http://localhost/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				"MCP-Protocol-Version": "2025-03-26",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "ping",
			}),
		});

		expect(response.status).toBe(200);
		const body = (await parseJsonRpcBody(response)) as {
			result?: unknown;
			error?: unknown;
		};
		expect(body.error).toBeUndefined();
		expect(body.result).toEqual({});
	});
});

// ─────────────────────────────────────────────────
// Unknown / malformed JSON-RPC requests
// ─────────────────────────────────────────────────
describe("JSON-RPC error handling", () => {
	it("unknown method: 404 + -32601 (Method Not Found)", async () => {
		const response = await mcpModernRequest("unknown/method");

		expect(response.status).toBe(404);
		const body = (await parseJsonRpcBody(response)) as {
			error?: { code?: number };
		};
		expect(body.error?.code).toBe(-32601);
	});

	it("malformed JSON body: 400 + -32700 (Parse Error)", async () => {
		const response = await rawRequest("http://localhost/mcp", {
			method: "POST",
			headers: {
				...MODERN_HEADERS,
				"MCP-Method": "tools/list",
			},
			body: "{ this is not valid json",
		});

		expect(response.status).toBe(400);
		const body = (await parseJsonRpcBody(response)) as {
			error?: { code?: number };
		};
		expect(body.error?.code).toBe(-32700);
	});

	it("JSON-RPC batch request: 400 + -32600 (Invalid Request)", async () => {
		const response = await rawRequest("http://localhost/mcp", {
			method: "POST",
			headers: {
				...MODERN_HEADERS,
				"MCP-Method": "tools/list",
			},
			body: JSON.stringify([
				{
					jsonrpc: "2.0",
					id: 1,
					method: "tools/list",
					params: { _meta: META_ENVELOPE },
				},
				{
					jsonrpc: "2.0",
					id: 2,
					method: "tools/list",
					params: { _meta: META_ENVELOPE },
				},
			]),
		});

		expect(response.status).toBe(400);
		const body = (await parseJsonRpcBody(response)) as {
			error?: { code?: number };
		};
		expect(body.error?.code).toBe(-32600);
	});

	it("notification (no id): 202 with empty body", async () => {
		const response = await rawRequest("http://localhost/mcp", {
			method: "POST",
			headers: {
				...MODERN_HEADERS,
				"MCP-Method": "notifications/initialized",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				method: "notifications/initialized",
				params: { _meta: META_ENVELOPE },
			}),
		});

		expect(response.status).toBe(202);
		const text = await response.text();
		expect(text).toBe("");
	});

	it("missing MCP-Method header: 400 + -32020 (Header Mismatch)", async () => {
		const response = await rawRequest("http://localhost/mcp", {
			method: "POST",
			headers: MODERN_HEADERS,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/list",
				params: { _meta: META_ENVELOPE },
			}),
		});

		expect(response.status).toBe(400);
		const body = (await parseJsonRpcBody(response)) as {
			error?: { code?: number };
		};
		expect(body.error?.code).toBe(-32020);
	});
});

// ─────────────────────────────────────────────────
// tools/call error paths
// ─────────────────────────────────────────────────
describe("tools/call error paths", () => {
	it("unknown tool name: 200 + -32602 (Invalid Params)", async () => {
		const response = await mcpModernRequest("tools/call", {
			name: "nonexistent_tool",
			arguments: {},
		});

		expect(response.status).toBe(200);
		const body = (await parseJsonRpcBody(response)) as {
			error?: { code?: number };
		};
		expect(body.error?.code).toBe(-32602);
	});

	it("input validation failure (page: 0 violates min(1)): 200 + isError tool result", async () => {
		const response = await mcpModernRequest("tools/call", {
			name: "get_fab_products",
			arguments: { page: 0 },
		});

		expect(response.status).toBe(200);
		const result = (await parseModernResult(response)) as {
			isError?: boolean;
			content?: Array<{ type: string; text?: string }>;
		};
		expect(result.isError).toBe(true);

		// Validation failures must not reach the CardVault API
		const axios = await import("axios");
		expect(vi.mocked(axios.default.get)).not.toHaveBeenCalled();
	});

	it("input validation failure (empty query violates min(1)): 200 + isError tool result", async () => {
		const response = await mcpModernRequest("tools/call", {
			name: "search_fab_cards",
			arguments: { query: "" },
		});

		expect(response.status).toBe(200);
		const result = (await parseModernResult(response)) as {
			isError?: boolean;
		};
		expect(result.isError).toBe(true);

		const axios = await import("axios");
		expect(vi.mocked(axios.default.get)).not.toHaveBeenCalled();
	});

	it("input validation failure (query over 200 chars violates max(200)): 200 + isError", async () => {
		const response = await mcpModernRequest("tools/call", {
			name: "search_fab_cards",
			arguments: { query: "a".repeat(201) },
		});

		expect(response.status).toBe(200);
		const result = (await parseModernResult(response)) as {
			isError?: boolean;
		};
		expect(result.isError).toBe(true);

		const axios = await import("axios");
		expect(vi.mocked(axios.default.get)).not.toHaveBeenCalled();
	});
});
