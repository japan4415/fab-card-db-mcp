/**
 * get_card_detail fallback branch tests.
 *
 * Covers the print/face selection branches documented in
 * docs/cardvault-api-analysis.md:
 *
 * (a) printId that matches only a face-level `face_id` (`_BACK` suffix
 *     on double-faced cards) selects the containing print and prefers
 *     that face.
 * (b) A card whose prints have no `is_default: true` falls back to the
 *     first print.
 * (c) Faces whose `layout_position` values arrive out of order are
 *     sorted so the position-0 face becomes primary.
 * (d) A Japanese-only card omits the en* fields entirely (new spec:
 *     enName/enText/enTypebox are optional and absent when no English
 *     face exists).
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

interface CardDetailResult {
	cardId: string;
	printId: string;
	imageUrl: string;
	enName?: string;
	enText?: string;
	enTypebox?: string;
	jaName?: string;
	jaText?: string;
	jaTypebox?: string;
	pitch?: string;
	variants?: Array<{ printId: string }>;
}

async function callGetCardDetail(args: Record<string, unknown>): Promise<{
	structuredContent?: CardDetailResult;
	content?: Array<{ type: string; text?: string }>;
	isError?: boolean;
}> {
	const response = await mcpModernRequest("tools/call", {
		name: "get_card_detail",
		arguments: args,
	});
	return (await parseModernResult(response)) as {
		structuredContent?: CardDetailResult;
		content?: Array<{ type: string; text?: string }>;
		isError?: boolean;
	};
}

beforeEach(async () => {
	const axios = await import("axios");
	vi.mocked(axios.default.get).mockReset();
});

// ─────────────────────────────────────────────────
// (a) face-level printId (_BACK suffix)
// ─────────────────────────────────────────────────
describe("face-level printId selection (_BACK suffix)", () => {
	const doubleFacedCard = {
		count: 1,
		next: null,
		previous: null,
		results: [
			{
				card_id: "MST001",
				cores: [],
				card_prints: [
					{
						print_id: "EN_MST001",
						print_language: "en",
						rarity: "Majestic",
						layout: "double-sided",
						is_default: true,
						faces: [
							{
								face_id: "EN_MST001",
								face_language: "en",
								finish_type: "regular",
								printed_name: "Front Side",
								image: { normal: "https://example.com/front.jpg" },
								layout_position: 0,
							},
							{
								face_id: "EN_MST001_BACK",
								face_language: "en",
								finish_type: "regular",
								printed_name: "Back Side",
								image: { normal: "https://example.com/back.jpg" },
								layout_position: 1,
							},
						],
						print_set: { set_name: "MST" },
					},
				],
			},
		],
	};

	it("printId matching only faces[].face_id selects the containing print and prefers that face", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({ data: doubleFacedCard });

		const result = await callGetCardDetail({
			cardId: "MST001",
			printId: "EN_MST001_BACK",
		});

		expect(result.isError).toBeUndefined();
		const detail = result.structuredContent!;
		// The print-level id is reported, not the face id
		expect(detail.printId).toBe("EN_MST001");
		// The preferred face is the back face
		expect(detail.imageUrl).toBe("https://example.com/back.jpg");
	});

	it("without printId, the layout_position-0 (front) face is primary", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({ data: doubleFacedCard });

		const result = await callGetCardDetail({ cardId: "MST001" });

		expect(result.isError).toBeUndefined();
		expect(result.structuredContent!.imageUrl).toBe("https://example.com/front.jpg");
	});
});

// ─────────────────────────────────────────────────
// (b) no is_default print → first print fallback
// ─────────────────────────────────────────────────
describe("default print fallback", () => {
	it("card without any is_default: true print falls back to the first print", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: {
				count: 1,
				next: null,
				previous: null,
				results: [
					{
						card_id: "ARC002",
						cores: [],
						card_prints: [
							{
								print_id: "EN_ARC002_C",
								print_language: "en",
								rarity: "Common",
								is_default: false,
								faces: [
									{
										face_id: "EN_ARC002_C",
										face_language: "en",
										printed_name: "First Print",
										image: { normal: "https://example.com/first.jpg" },
										layout_position: 0,
									},
								],
							},
							{
								print_id: "EN_ARC002_R",
								print_language: "en",
								rarity: "Rare",
								// is_default missing entirely
								faces: [
									{
										face_id: "EN_ARC002_R",
										face_language: "en",
										printed_name: "Second Print",
										image: { normal: "https://example.com/second.jpg" },
										layout_position: 0,
									},
								],
							},
						],
					},
				],
			},
		});

		const result = await callGetCardDetail({ cardId: "ARC002" });

		expect(result.isError).toBeUndefined();
		const detail = result.structuredContent!;
		expect(detail.printId).toBe("EN_ARC002_C");
		expect(detail.imageUrl).toBe("https://example.com/first.jpg");
	});
});

// ─────────────────────────────────────────────────
// (c) out-of-order layout_position faces
// ─────────────────────────────────────────────────
describe("primary face sorting", () => {
	it("faces arriving out of layout_position order are sorted so position 0 wins", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({
			data: {
				count: 1,
				next: null,
				previous: null,
				results: [
					{
						card_id: "DTD003",
						cores: [],
						card_prints: [
							{
								print_id: "EN_DTD003",
								print_language: "en",
								is_default: true,
								faces: [
									{
										face_id: "EN_DTD003_B",
										face_language: "en",
										printed_name: "Second Position Face",
										printed_pitch: 2,
										image: { normal: "https://example.com/pos1.jpg" },
										layout_position: 1,
									},
									{
										face_id: "EN_DTD003_A",
										face_language: "en",
										printed_name: "First Position Face",
										printed_pitch: 1,
										image: { normal: "https://example.com/pos0.jpg" },
										layout_position: 0,
									},
								],
							},
						],
					},
				],
			},
		});

		const result = await callGetCardDetail({ cardId: "DTD003" });

		expect(result.isError).toBeUndefined();
		const detail = result.structuredContent!;
		// Position-0 face wins even though it arrives second in the array
		expect(detail.imageUrl).toBe("https://example.com/pos0.jpg");
		expect(detail.pitch).toBe("1");
	});
});

// ─────────────────────────────────────────────────
// (d) Japanese-only card omits en* fields
// ─────────────────────────────────────────────────
describe("language field omission", () => {
	it("Japanese-only card omits enName/enText/enTypebox and includes ja* fields", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({ data: jaOnlyCardData });

		const result = await callGetCardDetail({ cardId: "JPO001" });

		expect(result.isError).toBeUndefined();
		const detail = result.structuredContent!;

		// en* fields must be absent (not null, not empty string)
		expect(detail.enName).toBeUndefined();
		expect(detail.enText).toBeUndefined();
		expect(detail.enTypebox).toBeUndefined();
		expect("enName" in detail).toBe(false);
		expect("enText" in detail).toBe(false);
		expect("enTypebox" in detail).toBe(false);

		// ja* fields are populated
		expect(detail.jaName).toBe("日本語のカード");
		expect(detail.jaText).toBe("日本語のルールテキスト");
		expect(detail.jaTypebox).toBe("アクション - 攻撃");
	});

	it("Japanese-only detail still conforms to the wire format (content text matches structuredContent)", async () => {
		const axios = await import("axios");
		vi.mocked(axios.default.get).mockResolvedValueOnce({ data: jaOnlyCardData });

		const result = await callGetCardDetail({ cardId: "JPO001" });

		const textBlock = result.content?.find((c) => c.type === "text" && c.text);
		expect(textBlock).toBeDefined();
		expect(JSON.parse(textBlock!.text!)).toEqual(result.structuredContent);
	});
});

const jaOnlyCardData = {
	count: 1,
	next: null,
	previous: null,
	results: [
		{
			card_id: "JPO001",
			cores: [{ pitch: "1" }],
			card_prints: [
				{
					print_id: "JA_JPO001",
					print_language: "ja",
					rarity: "Common",
					is_default: true,
					faces: [
						{
							face_id: "JA_JPO001",
							face_language: "ja",
							finish_type: "regular",
							printed_name: "日本語のカード",
							printed_rules_text: "日本語のルールテキスト",
							printed_typebox: "アクション - 攻撃",
							image: { normal: "https://example.com/ja.jpg" },
							layout_position: 0,
						},
					],
					print_set: { set_name: "JPO" },
				},
			],
		},
	],
};
