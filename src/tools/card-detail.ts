import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { fetchCardById, logAxiosError } from "../cardvault/client";
import type { CardVaultCardPrint } from "../cardvault/types";
import { logger } from "../logger";
import { type CardDetail, CardDetailOutputSchema, UNTRUSTED_OUTPUT_NOTE } from "../schemas";
import {
	asOptionalString,
	asStringOrEmpty,
	buildVariants,
	findFaceByLanguage,
	pickPrimaryFace,
} from "../transform";

export function registerGetCardDetailTool(server: McpServer): void {
	server.registerTool(
		"get_card_detail",
		{
			title: "Get Card Detail",
			description: `Get detailed information about a specific card including non-English text.

Inputs:
- cardId (required): The Flesh and Blood card identifier (for example, WTR001).
- printId (optional): Specify when you need a particular variant or language (for example, JA_WTR001).

This tool provides:
- Complete card data in English and other languages (when available)
- Card attributes (pitch, power, defense, cost)
- Publication details (set, rarity, artist)
- All available card variations

Recommended flow:
1. Use search_fab_cards to discover the correct cardId.
2. Call get_fab_card_prints with that cardId to confirm available printId values and languages.
3. Provide both identifiers here when you need a specific print variant (especially for non-English cards).

Notes:
- When printId is omitted, the tool uses the default print from cardvault.fabtcg.com.
- If the requested card or print combination does not exist, the tool returns an error message.
- If the card has no English-language print, the en* fields (enName, enText, enTypebox) are omitted from the output.

${UNTRUSTED_OUTPUT_NOTE}`,
			inputSchema: z.object({
				cardId: z.string().min(1).max(200),
				printId: z.string().min(1).max(200).optional(),
			}),
			outputSchema: CardDetailOutputSchema,
		},
		async ({ cardId, printId }: { cardId: string; printId?: string }) => {
			try {
				logger.info(
					{
						tool: "get_card_detail",
						action: "detail_start",
						cardId,
						printId: printId ?? null,
					},
					"Card detail retrieval started",
				);

				const card = await fetchCardById(cardId);
				if (!card) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Error: No card found matching cardId='${cardId}'`,
							},
						],
						isError: true,
					};
				}

				const resolvedCardId = asOptionalString(card.card_id) ?? cardId;
				const cardPrints = card.card_prints ?? [];
				if (cardPrints.length === 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Error: No prints available for cardId='${resolvedCardId}'`,
							},
						],
						isError: true,
					};
				}

				let selectedPrint: CardVaultCardPrint | undefined;
				let preferredFaceId: string | undefined;

				if (printId) {
					selectedPrint = cardPrints.find(
						(cardPrint) => asOptionalString(cardPrint.print_id) === printId,
					);
					if (!selectedPrint) {
						selectedPrint = cardPrints.find((cardPrint) =>
							(cardPrint.faces ?? []).some(
								(face) => asOptionalString(face.face_id) === printId,
							),
						);
						preferredFaceId = printId;
					}

					if (!selectedPrint) {
						return {
							content: [
								{
									type: "text" as const,
									text: `Error: printId='${printId}' does not exist for cardId='${resolvedCardId}'`,
								},
							],
							isError: true,
						};
					}
				} else {
					selectedPrint =
						cardPrints.find((cardPrint) => cardPrint.is_default) ?? cardPrints[0];
				}

				const selectedFace = pickPrimaryFace(
					selectedPrint.faces,
					preferredFaceId ?? printId,
				);
				const englishFace = findFaceByLanguage(cardPrints, "en");
				const japaneseFace = findFaceByLanguage(cardPrints, "ja");

				const resolvedPrintId = asOptionalString(selectedPrint.print_id) ?? printId ?? "";

				const cardDetail: CardDetail = {
					cardId: resolvedCardId,
					printId: resolvedPrintId,
					imageUrl: asStringOrEmpty(selectedFace?.image?.normal),
					enName: asOptionalString(englishFace?.printed_name),
					enText: asOptionalString(englishFace?.printed_rules_text),
					enTypebox: asOptionalString(englishFace?.printed_typebox),
					jaName: asOptionalString(japaneseFace?.printed_name),
					jaText: asOptionalString(japaneseFace?.printed_rules_text),
					jaTypebox: asOptionalString(japaneseFace?.printed_typebox),
					pitch:
						asOptionalString(selectedFace?.printed_pitch) ??
						asOptionalString(card.cores?.[0]?.pitch),
					cost:
						asOptionalString(selectedFace?.printed_cost) ??
						asOptionalString(card.cores?.[0]?.cost),
					power:
						asOptionalString(selectedFace?.printed_power) ??
						asOptionalString(card.cores?.[0]?.power),
					defense:
						asOptionalString(selectedFace?.printed_defense) ??
						asOptionalString(card.cores?.[0]?.defense),
					set:
						asOptionalString(selectedPrint.print_set?.set_name) ??
						asOptionalString(selectedPrint.product?.product_name),
					rarity: asOptionalString(selectedPrint.rarity),
					artist: asOptionalString(selectedFace?.printed_artist),
					variants: buildVariants(resolvedCardId, cardPrints),
				};

				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(cardDetail, null, 2),
						},
					],
					structuredContent: cardDetail,
				};
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error occurred";
				logger.error(
					{
						tool: "get_card_detail",
						action: "error",
						error: errorMessage,
						cardId,
						printId: printId ?? null,
					},
					"Error while retrieving card detail",
				);
				logAxiosError("get_card_detail", error);
				if (error instanceof Error) {
					logger.error(
						{
							tool: "get_card_detail",
							action: "error_stack",
							stack: error.stack,
						},
						"Error stack trace",
					);
				}
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: A problem occurred while retrieving card detail - ${errorMessage}`,
						},
					],
					isError: true,
				};
			}
		},
	);
}
