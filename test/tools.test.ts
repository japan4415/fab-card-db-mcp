/**
 * Tool logic unit tests.
 *
 * Tests each of the 4 MCP tools by mocking the external CardVault API
 * responses. Covers normal cases, edge cases, and error handling
 * documented in docs/cardvault-api-analysis.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mcpModernRequest, parseModernResult } from "./helpers";

// Mock axios
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

function createAxiosError(status: number, data?: unknown): Error {
	const error = new Error(`Request failed with status code ${status}`) as Error & {
		_isAxiosError: boolean;
		response: { status: number; data: unknown };
	};
	error._isAxiosError = true;
	error.response = { status, data };
	return error;
}

async function callTool(
	name: string,
	args: Record<string, unknown>,
): Promise<{
	structuredContent?: unknown;
	content?: Array<{ type: string; text?: string }>;
	isError?: boolean;
	resultType?: string;
}> {
	const response = await mcpModernRequest("tools/call", {
		name,
		arguments: args,
	});
	return (await parseModernResult(response)) as {
		structuredContent?: unknown;
		content?: Array<{ type: string; text?: string }>;
		isError?: boolean;
		resultType?: string;
	};
}

beforeEach(async () => {
	const axios = await import("axios");
	vi.mocked(axios.default.get).mockReset();
});

// ─────────────────────────────────────────────────
// search_fab_cards
// ─────────────────────────────────────────────────
describe("search_fab_cards", () => {
	it("normal case: returns mapped card data", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: {
				count: 2,
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
									normal: "https://example.com/wtr001.jpg",
								},
								layout_position: 0,
							},
						],
					},
					{
						card_id: "WTR002",
						print_id: "EN_WTR002",
						printed_name: "Blade Flurry",
						faces: [],
					},
				],
			},
		});

		const result = await callTool("search_fab_cards", {
			query: "Awakening",
		});

		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toBeDefined();

		const cards = result.structuredContent as Array<{
			id: string;
			name: string;
			displayName: string;
			cardUrl: string;
			imageUrl: string;
		}>;
		expect(cards).toHaveLength(2);
		expect(cards[0].id).toBe("WTR001");
		expect(cards[0].name).toBe("Awakening");
		expect(cards[0].cardUrl).toContain("WTR001");
		expect(cards[0].imageUrl).toBe("https://example.com/wtr001.jpg");
	});

	it("empty results: returns empty array", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: {
				count: 0,
				next: null,
				previous: null,
				results: [],
			},
		});

		const result = await callTool("search_fab_cards", {
			query: "nonexistent_card_xyz",
		});

		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toEqual([]);
	});

	it("API 5xx error: returns isError with message", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockRejectedValueOnce(
			createAxiosError(500, { detail: "Internal Server Error" }),
		);

		const result = await callTool("search_fab_cards", {
			query: "test",
		});

		expect(result.isError).toBe(true);
		expect(result.content).toBeDefined();
		const text = result.content?.find((c) => c.type === "text")?.text;
		expect(text).toContain("Error");
	});
});

// ─────────────────────────────────────────────────
// get_fab_card_prints
// ─────────────────────────────────────────────────
describe("get_fab_card_prints", () => {
	it("normal case: returns mapped print data", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
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
								product: { product_name: "Welcome to Rathe" },
								print_set: { set_name: "WTR" },
							},
							{
								print_id: "JA_WTR001",
								print_language: "ja",
								rarity: "Common",
								layout: "normal",
								is_default: false,
								faces: [
									{
										face_id: "JA_WTR001",
										face_language: "ja",
										finish_type: "foil",
										printed_name: "覚醒",
										image: {
											small: "https://example.com/ja_sm.jpg",
											normal: "https://example.com/ja_img.jpg",
											large: "https://example.com/ja_lg.jpg",
										},
										layout_position: 0,
									},
								],
							},
						],
					},
				],
			},
		});

		const result = await callTool("get_fab_card_prints", {
			cardId: "WTR001",
		});

		expect(result.isError).toBeUndefined();
		const prints = result.structuredContent as Array<{
			printId: string;
			cardId: string;
			name: string;
			layout: { key: string; label: string };
			finishTypes: Array<{ key: string; label: string }>;
		}>;

		expect(prints).toHaveLength(2);
		expect(prints[0].printId).toBe("EN_WTR001");
		expect(prints[0].cardId).toBe("WTR001");
		expect(prints[0].name).toBe("Awakening");
		expect(prints[0].layout.key).toBe("normal");
		expect(prints[0].finishTypes[0].key).toBe("regular");
		expect(prints[1].printId).toBe("JA_WTR001");
		expect(prints[1].name).toBe("覚醒");
	});

	it("card_id returns 200 but results: [] (known edge case)", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: {
				count: 0,
				next: null,
				previous: null,
				results: [],
			},
		});

		const result = await callTool("get_fab_card_prints", {
			cardId: "NONEXISTENT",
		});

		// Should gracefully handle empty results
		expect(result.isError).toBeUndefined();
		const prints = result.structuredContent as unknown[];
		expect(prints).toEqual([]);
	});

	it("API 5xx error: returns isError", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockRejectedValueOnce(
			createAxiosError(500, { detail: "Internal Server Error" }),
		);

		const result = await callTool("get_fab_card_prints", {
			cardId: "WTR001",
		});

		expect(result.isError).toBe(true);
	});
});

// ─────────────────────────────────────────────────
// get_card_detail
// ─────────────────────────────────────────────────
describe("get_card_detail", () => {
	const fullCardData = {
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
						product: { product_name: "Welcome to Rathe" },
						print_set: { set_name: "WTR" },
					},
					{
						print_id: "JA_WTR001",
						print_language: "ja",
						rarity: "Common",
						layout: "normal",
						is_default: false,
						faces: [
							{
								face_id: "JA_WTR001",
								face_language: "ja",
								finish_type: "regular",
								printed_name: "覚醒",
								printed_rules_text: "再度行動",
								printed_typebox: "アクション - 攻撃",
								image: {
									small: "https://example.com/ja_sm.jpg",
									normal: "https://example.com/ja_img.jpg",
									large: "https://example.com/ja_lg.jpg",
								},
								layout_position: 0,
							},
						],
					},
				],
			},
		],
	};

	it("normal case: returns full card detail", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: fullCardData,
		});

		const result = await callTool("get_card_detail", {
			cardId: "WTR001",
		});

		expect(result.isError).toBeUndefined();
		const detail = result.structuredContent as {
			cardId: string;
			printId: string;
			enName: string;
			jaName?: string;
			set?: string;
			rarity?: string;
			artist?: string;
			variants?: unknown[];
		};

		expect(detail.cardId).toBe("WTR001");
		expect(detail.enName).toBe("Awakening");
		expect(detail.jaName).toBe("覚醒");
		expect(detail.set).toBeDefined();
		expect(detail.rarity).toBe("Common");
		expect(detail.artist).toBe("Darren Bader");
		expect(detail.variants).toBeDefined();
		expect(detail.variants!.length).toBeGreaterThan(0);
	});

	it("with specific printId: selects correct print", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: fullCardData,
		});

		const result = await callTool("get_card_detail", {
			cardId: "WTR001",
			printId: "JA_WTR001",
		});

		expect(result.isError).toBeUndefined();
		const detail = result.structuredContent as {
			cardId: string;
			printId: string;
			imageUrl: string;
		};

		expect(detail.cardId).toBe("WTR001");
		// Should select the Japanese print
		expect(detail.printId).toBe("JA_WTR001");
	});

	it("card_id returns 200 + results: [] (card not found)", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: {
				count: 0,
				next: null,
				previous: null,
				results: [],
			},
		});

		const result = await callTool("get_card_detail", {
			cardId: "NONEXISTENT",
		});

		expect(result.isError).toBe(true);
		const text = result.content?.find((c) => c.type === "text")?.text;
		expect(text).toContain("No card found");
	});

	it("card exists but has no prints", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: {
				count: 1,
				next: null,
				previous: null,
				results: [
					{
						card_id: "EMPTY001",
						cores: [],
						card_prints: [],
					},
				],
			},
		});

		const result = await callTool("get_card_detail", {
			cardId: "EMPTY001",
		});

		expect(result.isError).toBe(true);
		const text = result.content?.find((c) => c.type === "text")?.text;
		expect(text).toContain("No prints available");
	});

	it("printId not found for given card", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: fullCardData,
		});

		const result = await callTool("get_card_detail", {
			cardId: "WTR001",
			printId: "NONEXISTENT_PRINT",
		});

		expect(result.isError).toBe(true);
		const text = result.content?.find((c) => c.type === "text")?.text;
		expect(text).toContain("does not exist");
	});

	it("API 5xx error: returns isError", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockRejectedValueOnce(
			createAxiosError(503, { detail: "Service Unavailable" }),
		);

		const result = await callTool("get_card_detail", {
			cardId: "WTR001",
		});

		expect(result.isError).toBe(true);
		const text = result.content?.find((c) => c.type === "text")?.text;
		expect(text).toContain("Error");
	});
});

// ─────────────────────────────────────────────────
// get_fab_products
// ─────────────────────────────────────────────────
describe("get_fab_products", () => {
	it("normal case: returns product groups", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: {
				count: 15,
				next: "https://api.cardvault.fabtcg.com/carddb/api/v1/product-groups-products/?page=2",
				previous: null,
				results: [
					{
						id: "grp-1",
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
								description: "A booster box of WTR",
							},
						],
					},
				],
			},
		});

		const result = await callTool("get_fab_products", {});

		expect(result.isError).toBeUndefined();
		const data = result.structuredContent as {
			page: number;
			count: number;
			next: string | null;
			previous: string | null;
			nextPage?: number;
			previousPage?: number;
			productGroups: Array<{
				id: string;
				groupName: string;
				products: Array<{ id: string; productName: string }>;
			}>;
		};

		expect(data.page).toBe(1);
		expect(data.count).toBe(15);
		expect(data.nextPage).toBe(2);
		expect(data.previousPage).toBeUndefined();
		expect(data.productGroups).toHaveLength(1);
		expect(data.productGroups[0].groupName).toBe("Welcome to Rathe");
		expect(data.productGroups[0].products[0].productName).toBe("WTR Booster Box");
	});

	it("with page parameter", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: {
				count: 15,
				next: null,
				previous:
					"https://api.cardvault.fabtcg.com/carddb/api/v1/product-groups-products/?page=1",
				results: [
					{
						id: "grp-2",
						group_name: "Arcane Rising",
						products: [],
					},
				],
			},
		});

		const result = await callTool("get_fab_products", { page: 2 });

		expect(result.isError).toBeUndefined();
		const data = result.structuredContent as {
			page: number;
			previousPage?: number;
			nextPage?: number;
		};
		expect(data.page).toBe(2);
		expect(data.previousPage).toBe(1);
		expect(data.nextPage).toBeUndefined();
	});

	it("page out of range: 404 with 'Invalid page' (known edge case)", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockRejectedValueOnce(
			createAxiosError(404, { detail: "Invalid page." }),
		);

		const result = await callTool("get_fab_products", { page: 9999 });

		expect(result.isError).toBe(true);
		const text = result.content?.find((c) => c.type === "text")?.text;
		expect(text).toContain("invalid");
	});

	it("API 5xx error: returns isError with generic message", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockRejectedValueOnce(
			createAxiosError(500, { detail: "Internal Server Error" }),
		);

		const result = await callTool("get_fab_products", {});

		expect(result.isError).toBe(true);
		const text = result.content?.find((c) => c.type === "text")?.text;
		expect(text).toContain("Error");
		// Should NOT show the page-specific message for non-404 errors
		expect(text).not.toContain("invalid");
	});

	it("language is uppercased", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: {
				count: 1,
				next: null,
				previous: null,
				results: [
					{
						id: "grp-1",
						group_name: "Test",
						products: [
							{
								id: "prod-1",
								product_name: "Test Product",
								printed_language: "ja",
							},
						],
					},
				],
			},
		});

		const result = await callTool("get_fab_products", {});
		const data = result.structuredContent as {
			productGroups: Array<{
				products: Array<{ language?: string }>;
			}>;
		};
		expect(data.productGroups[0].products[0].language).toBe("JA");
	});
});
