/**
 * MCP 2026-07-28 protocol conformance tests.
 *
 * These tests verify that the server conforms to the MCP 2026-07-28
 * protocol revision. External APIs are mocked so no network access
 * is required.
 *
 * IMPORTANT: If a test fails because the implementation does not meet
 * the spec, the test MUST remain as-is. The failure is reported as an
 * implementation bug, not a test bug.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import { mcpModernRequest, parseModernResult, rawRequest } from "./helpers";

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

// Use Ajv2020 for draft/2020-12 schema support
const ajv = new Ajv2020({ strict: false, allErrors: true });

const EXPECTED_TOOL_NAMES = [
	"search_fab_cards",
	"get_fab_card_prints",
	"get_card_detail",
	"get_fab_products",
];

// ─────────────────────────────────────────────────
// server/discover
// ─────────────────────────────────────────────────
describe("server/discover", () => {
	it("responds with 200 and lists supported versions", async () => {
		const response = await mcpModernRequest("server/discover");
		expect(response.status).toBe(200);

		const result = await parseModernResult(response);
		const typed = result as {
			supportedVersions: string[];
			capabilities: Record<string, unknown>;
		};
		expect(typed.supportedVersions).toContain("2026-07-28");
		expect(typed.capabilities).toBeDefined();
	});

	it("includes tools capability", async () => {
		const response = await mcpModernRequest("server/discover");
		const result = (await parseModernResult(response)) as {
			capabilities: { tools?: unknown };
		};
		expect(result.capabilities.tools).toBeDefined();
	});
});

// ─────────────────────────────────────────────────
// tools/list
// ─────────────────────────────────────────────────
describe("tools/list", () => {
	it("returns all 4 tools", async () => {
		const response = await mcpModernRequest("tools/list");
		expect(response.status).toBe(200);

		const result = (await parseModernResult(response)) as {
			tools: Array<{ name: string }>;
		};
		const toolNames = result.tools.map((t) => t.name);

		for (const expected of EXPECTED_TOOL_NAMES) {
			expect(toolNames).toContain(expected);
		}
		expect(result.tools).toHaveLength(4);
	});

	it("each tool has name, title, description, inputSchema, outputSchema", async () => {
		const response = await mcpModernRequest("tools/list");
		const result = (await parseModernResult(response)) as {
			tools: Array<{
				name: string;
				title?: string;
				description?: string;
				inputSchema?: unknown;
				outputSchema?: unknown;
			}>;
		};

		for (const tool of result.tools) {
			expect(tool.name, "tool.name missing").toBeDefined();
			expect(tool.title, `tool '${tool.name}' missing title`).toBeDefined();
			expect(tool.description, `tool '${tool.name}' missing description`).toBeDefined();
			expect(tool.inputSchema, `tool '${tool.name}' missing inputSchema`).toBeDefined();
			expect(tool.outputSchema, `tool '${tool.name}' missing outputSchema`).toBeDefined();
		}
	});

	it("inputSchema and outputSchema are valid JSON Schema", async () => {
		const response = await mcpModernRequest("tools/list");
		const result = (await parseModernResult(response)) as {
			tools: Array<{
				name: string;
				inputSchema: Record<string, unknown>;
				outputSchema: Record<string, unknown>;
			}>;
		};

		for (const tool of result.tools) {
			// Schemas should compile without error
			const inputCompile = () => ajv.compile(tool.inputSchema);
			expect(inputCompile).not.toThrow();

			const outputCompile = () => ajv.compile(tool.outputSchema);
			expect(outputCompile).not.toThrow();
		}
	});

	it("response includes resultType", async () => {
		const response = await mcpModernRequest("tools/list");
		const result = (await parseModernResult(response)) as {
			resultType?: string;
		};
		expect(result.resultType).toBeDefined();
	});
});

// ─────────────────────────────────────────────────
// tools/call - structuredContent validation
// ─────────────────────────────────────────────────
describe("tools/call structuredContent", () => {
	// Fetch output schemas from tools/list
	async function getToolOutputSchemas(): Promise<Map<string, Record<string, unknown>>> {
		const response = await mcpModernRequest("tools/list");
		const result = (await parseModernResult(response)) as {
			tools: Array<{
				name: string;
				outputSchema: Record<string, unknown>;
			}>;
		};
		const schemas = new Map<string, Record<string, unknown>>();
		for (const tool of result.tools) {
			schemas.set(tool.name, tool.outputSchema);
		}
		return schemas;
	}

	beforeEach(async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockReset();
	});

	it("search_fab_cards returns structuredContent conforming to outputSchema", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValue({
			data: {
				count: 1,
				next: null,
				previous: null,
				results: [
					{
						card_id: "WTR001",
						print_id: "EN_WTR001",
						printed_name: "Awakening",
						printed_pitch: 1,
						printed_cost: "0",
						printed_power: "3",
						printed_defense: "3",
						printed_rules_text: "Go again",
						printed_typebox: "Action - Attack",
						faces: [
							{
								image: {
									normal: "https://example.com/img.jpg",
								},
							},
						],
					},
				],
			},
		});

		const schemas = await getToolOutputSchemas();
		const outputSchema = schemas.get("search_fab_cards");
		expect(outputSchema).toBeDefined();

		const response = await mcpModernRequest("tools/call", {
			name: "search_fab_cards",
			arguments: { query: "Awakening" },
		});
		expect(response.status).toBe(200);

		const result = (await parseModernResult(response)) as {
			structuredContent?: unknown;
			content?: Array<{ type: string; text?: string }>;
			resultType?: string;
		};

		// structuredContent must be present
		expect(
			result.structuredContent,
			"structuredContent must be present in tools/call response",
		).toBeDefined();

		// Validate structuredContent against declared outputSchema
		const validate = ajv.compile(outputSchema!);
		const valid = validate(result.structuredContent);
		expect(
			valid,
			`structuredContent does not conform to outputSchema: ${JSON.stringify(
				validate.errors,
			)}`,
		).toBe(true);

		// resultType must be present
		expect(
			result.resultType,
			"resultType must be present in tools/call response",
		).toBeDefined();
	});

	it("get_card_detail returns structuredContent conforming to outputSchema", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValue({
			data: {
				count: 1,
				next: null,
				previous: null,
				results: [
					{
						card_id: "WTR001",
						cores: [{ pitch: "1", cost: "0", power: "3", defense: "3" }],
						card_prints: [
							{
								print_id: "EN_WTR001",
								print_language: "en",
								rarity: "Common",
								layout: "normal",
								is_default: true,
								faces: [
									{
										face_id: "EN_WTR001",
										face_language: "en",
										finish_type: "regular",
										printed_name: "Awakening",
										printed_pitch: 1,
										printed_cost: "0",
										printed_power: "3",
										printed_defense: "3",
										printed_rules_text: "Go again",
										printed_typebox: "Action - Attack",
										printed_artist: "Darren Bader",
										image: {
											small: "https://example.com/sm.jpg",
											normal: "https://example.com/img.jpg",
											large: "https://example.com/lg.jpg",
										},
										layout_position: 0,
									},
								],
								product: {
									product_name: "Welcome to Rathe",
								},
								print_set: { set_name: "WTR" },
							},
						],
					},
				],
			},
		});

		const schemas = await getToolOutputSchemas();
		const outputSchema = schemas.get("get_card_detail");
		expect(outputSchema).toBeDefined();

		const response = await mcpModernRequest("tools/call", {
			name: "get_card_detail",
			arguments: { cardId: "WTR001" },
		});
		expect(response.status).toBe(200);

		const result = (await parseModernResult(response)) as {
			structuredContent?: unknown;
			content?: Array<{ type: string; text?: string }>;
			resultType?: string;
		};

		expect(result.structuredContent).toBeDefined();

		const validate = ajv.compile(outputSchema!);
		const valid = validate(result.structuredContent);
		expect(
			valid,
			`structuredContent does not conform to outputSchema: ${JSON.stringify(
				validate.errors,
			)}`,
		).toBe(true);
	});

	it("get_fab_products returns structuredContent conforming to outputSchema", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValue({
			data: {
				count: 1,
				next: "https://api.example.com/?page=2",
				previous: null,
				results: [
					{
						id: "group-1",
						group_name: "Welcome to Rathe",
						product_type: "booster",
						release_date: "2019-10-11",
						products: [
							{
								id: "prod-1",
								product_name: "WTR Booster Box",
								slug: "wtr-booster-box",
								printed_language: "en",
								printed_date: "2019-10-11",
								product_type: "booster",
								release_date: "2019-10-11",
								description: "A booster box",
							},
						],
					},
				],
			},
		});

		const schemas = await getToolOutputSchemas();
		const outputSchema = schemas.get("get_fab_products");
		expect(outputSchema).toBeDefined();

		const response = await mcpModernRequest("tools/call", {
			name: "get_fab_products",
			arguments: {},
		});
		expect(response.status).toBe(200);

		const result = (await parseModernResult(response)) as {
			structuredContent?: unknown;
			resultType?: string;
		};

		expect(result.structuredContent).toBeDefined();

		const validate = ajv.compile(outputSchema!);
		const valid = validate(result.structuredContent);
		expect(
			valid,
			`structuredContent does not conform to outputSchema: ${JSON.stringify(
				validate.errors,
			)}`,
		).toBe(true);
	});

	it("get_fab_card_prints returns structuredContent conforming to outputSchema", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValue({
			data: {
				count: 1,
				next: null,
				previous: null,
				results: [
					{
						card_id: "WTR001",
						cores: [],
						card_prints: [
							{
								print_id: "EN_WTR001",
								print_language: "en",
								rarity: "Common",
								layout: "normal",
								is_default: true,
								faces: [
									{
										face_id: "EN_WTR001",
										face_language: "en",
										finish_type: "regular",
										printed_name: "Awakening",
										printed_pitch: 1,
										image: {
											small: "https://example.com/sm.jpg",
											normal: "https://example.com/img.jpg",
											large: "https://example.com/lg.jpg",
										},
										layout_position: 0,
									},
								],
								product: {
									product_name: "Welcome to Rathe",
								},
								print_set: { set_name: "WTR" },
							},
						],
					},
				],
			},
		});

		const schemas = await getToolOutputSchemas();
		const outputSchema = schemas.get("get_fab_card_prints");
		expect(outputSchema).toBeDefined();

		const response = await mcpModernRequest("tools/call", {
			name: "get_fab_card_prints",
			arguments: { cardId: "WTR001" },
		});
		expect(response.status).toBe(200);

		const result = (await parseModernResult(response)) as {
			structuredContent?: unknown;
			resultType?: string;
		};

		expect(result.structuredContent).toBeDefined();

		const validate = ajv.compile(outputSchema!);
		const valid = validate(result.structuredContent);
		expect(
			valid,
			`structuredContent does not conform to outputSchema: ${JSON.stringify(
				validate.errors,
			)}`,
		).toBe(true);
	});
});

// ─────────────────────────────────────────────────
// tools/call - content backward compatibility
// ─────────────────────────────────────────────────
describe("tools/call content backward compatibility", () => {
	beforeEach(async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockReset();
	});

	it("structuredContent JSON matches content TextContent text (SHOULD requirement)", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValue({
			data: {
				count: 1,
				next: null,
				previous: null,
				results: [
					{
						card_id: "WTR001",
						print_id: "EN_WTR001",
						printed_name: "Awakening",
						faces: [
							{
								image: {
									normal: "https://example.com/img.jpg",
								},
							},
						],
					},
				],
			},
		});

		const response = await mcpModernRequest("tools/call", {
			name: "search_fab_cards",
			arguments: { query: "Awakening" },
		});
		expect(response.status).toBe(200);

		const result = (await parseModernResult(response)) as {
			structuredContent?: unknown;
			content?: Array<{ type: string; text?: string }>;
		};

		expect(result.structuredContent).toBeDefined();
		expect(result.content).toBeDefined();

		// Find the TextContent block
		const textBlock = result.content?.find((c) => c.type === "text" && c.text);
		expect(textBlock, "content must include a TextContent block").toBeDefined();

		// The TextContent text should be the JSON serialization of structuredContent
		const parsedText = JSON.parse(textBlock!.text!);
		expect(parsedText).toEqual(result.structuredContent);
	});
});

// ─────────────────────────────────────────────────
// /mcp method restrictions (protocol-level)
// ─────────────────────────────────────────────────
describe("/mcp method restrictions", () => {
	it("GET /mcp returns 405 Method Not Allowed", async () => {
		const response = await rawRequest("http://localhost/mcp", {
			method: "GET",
			headers: {
				Accept: "application/json, text/event-stream",
			},
		});
		expect(response.status).toBe(405);
	});

	it("DELETE /mcp returns 405 Method Not Allowed", async () => {
		const response = await rawRequest("http://localhost/mcp", {
			method: "DELETE",
			headers: {
				Accept: "application/json, text/event-stream",
			},
		});
		expect(response.status).toBe(405);
	});
});
