/**
 * Shared test helpers for MCP protocol testing.
 */
import worker from "../src/index";

const env = {} as Env;
const ctx = {
	waitUntil: () => {},
	passThroughOnException: () => {},
} as unknown as ExecutionContext;

/**
 * Per-request envelope keys required by the MCP 2026-07-28 protocol revision.
 */
const META_ENVELOPE = {
	"io.modelcontextprotocol/protocolVersion": "2026-07-28",
	"io.modelcontextprotocol/clientCapabilities": {},
};

/**
 * Send a modern (2026-07-28) MCP JSON-RPC request to the worker's /mcp endpoint.
 *
 * Automatically sets the required headers:
 * - MCP-Protocol-Version
 * - MCP-Method (matches the JSON-RPC method)
 * - MCP-Name (set when params.name is present, e.g. for tools/call)
 */
export async function mcpModernRequest(
	method: string,
	params?: Record<string, unknown>,
): Promise<Response> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Accept: "application/json, text/event-stream",
		Host: "localhost",
		"MCP-Protocol-Version": "2026-07-28",
		"MCP-Method": method,
	};

	// MCP-Name header is required when params.name is present (e.g. tools/call)
	if (params?.name && typeof params.name === "string") {
		headers["MCP-Name"] = params.name;
	}

	return worker.fetch(
		new Request("http://localhost/mcp", {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method,
				params: { _meta: META_ENVELOPE, ...params },
			}),
		}),
		env,
		ctx,
	);
}

/**
 * Send a raw HTTP request to the worker.
 * Always includes Host: localhost.
 */
export async function rawRequest(url: string, init?: RequestInit): Promise<Response> {
	const mergedHeaders = new Headers(init?.headers);
	if (!mergedHeaders.has("Host")) {
		mergedHeaders.set("Host", "localhost");
	}

	return worker.fetch(
		new Request(url, {
			...init,
			headers: mergedHeaders,
		}),
		env,
		ctx,
	);
}

/**
 * Parse a JSON-RPC result from a modern MCP response.
 * Returns the unwrapped `result` field.
 */
export async function parseModernResult(response: Response): Promise<unknown> {
	const contentType = response.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		const body = (await response.json()) as { result?: unknown };
		return body.result;
	}

	// SSE format: parse event stream
	const text = await response.text();
	const lines = text.split("\n");
	for (const line of lines) {
		if (line.startsWith("data: ")) {
			const data = JSON.parse(line.slice(6));
			return data.result;
		}
	}

	throw new Error(`Unexpected content type: ${contentType}`);
}

/**
 * Parse a JSON-RPC response body (full, including error).
 */
export async function parseJsonRpcBody(
	response: Response,
): Promise<{ result?: unknown; error?: unknown }> {
	const contentType = response.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		return await response.json();
	}

	// SSE format
	const text = await response.text();
	const lines = text.split("\n");
	for (const line of lines) {
		if (line.startsWith("data: ")) {
			return JSON.parse(line.slice(6));
		}
	}

	throw new Error(`Could not parse response: ${contentType}`);
}
