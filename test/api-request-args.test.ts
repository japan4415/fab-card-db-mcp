/**
 * CardVault API request argument tests.
 *
 * Verifies that each tool calls the CardVault API with the exact URL,
 * query params, timeout, and headers. In particular this pins the
 * trailing slash on `advanced-search/` — without it the API answers
 * with a 301 redirect (known pitfall documented during live probing).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const API_BASE = "https://api.cardvault.fabtcg.com/carddb/api/v1";

async function callTool(name: string, args: Record<string, unknown>): Promise<void> {
	const response = await mcpModernRequest("tools/call", {
		name,
		arguments: args,
	});
	await parseModernResult(response);
}

beforeEach(async () => {
	const axios = await import("axios");
	vi.mocked(axios.default.get).mockReset();
});

describe("CardVault API request arguments", () => {
	it("search_fab_cards: GET /advanced-search/ with trailing slash, q/page_size/orderby params", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: { count: 0, next: null, previous: null, results: [] },
		});

		await callTool("search_fab_cards", { query: "Awakening" });

		const mockGet = vi.mocked(axios.default.get);
		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(mockGet).toHaveBeenCalledWith(`${API_BASE}/advanced-search/`, {
			params: { q: "Awakening", page_size: 60, orderby: "name" },
			timeout: 15000,
			headers: { Accept: "application/json" },
		});
	});

	it("search_fab_cards: URL keeps the trailing slash (no 301-prone slash-less variant)", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: { count: 0, next: null, previous: null, results: [] },
		});

		await callTool("search_fab_cards", { query: "test" });

		const calledUrl = vi.mocked(axios.default.get).mock.calls[0][0] as string;
		expect(calledUrl.endsWith("/advanced-search/")).toBe(true);
		expect(calledUrl.endsWith("/advanced-search")).toBe(false);
	});

	it("get_fab_card_prints: GET /card_id/{cardId}/ with timeout and Accept header", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: { count: 0, next: null, previous: null, results: [] },
		});

		await callTool("get_fab_card_prints", { cardId: "WTR001" });

		const mockGet = vi.mocked(axios.default.get);
		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(mockGet).toHaveBeenCalledWith(`${API_BASE}/card_id/WTR001/`, {
			params: undefined,
			timeout: 15000,
			headers: { Accept: "application/json" },
		});
	});

	it("get_card_detail: GET /card_id/{cardId}/ (single request even with printId)", async () => {
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
								is_default: true,
								faces: [],
							},
						],
					},
				],
			},
		});

		await callTool("get_card_detail", { cardId: "WTR001", printId: "EN_WTR001" });

		const mockGet = vi.mocked(axios.default.get);
		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(mockGet).toHaveBeenCalledWith(`${API_BASE}/card_id/WTR001/`, {
			params: undefined,
			timeout: 15000,
			headers: { Accept: "application/json" },
		});
	});

	it("get_fab_products: GET /product-groups-products/ with page param (default 1)", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: { count: 0, next: null, previous: null, results: [] },
		});

		await callTool("get_fab_products", {});

		const mockGet = vi.mocked(axios.default.get);
		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(mockGet).toHaveBeenCalledWith(`${API_BASE}/product-groups-products/`, {
			params: { page: 1 },
			timeout: 15000,
			headers: { Accept: "application/json" },
		});
	});

	it("get_fab_products: explicit page is forwarded as-is", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: { count: 0, next: null, previous: null, results: [] },
		});

		await callTool("get_fab_products", { page: 3 });

		expect(vi.mocked(axios.default.get)).toHaveBeenCalledWith(
			`${API_BASE}/product-groups-products/`,
			{
				params: { page: 3 },
				timeout: 15000,
				headers: { Accept: "application/json" },
			},
		);
	});

	it("cardId is URL-encoded in the request path", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: { count: 0, next: null, previous: null, results: [] },
		});

		await callTool("get_fab_card_prints", { cardId: "WTR 001/?" });

		const calledUrl = vi.mocked(axios.default.get).mock.calls[0][0] as string;
		expect(calledUrl).toBe(`${API_BASE}/card_id/WTR%20001%2F%3F/`);
	});
});
