import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { fetchCardById, logAxiosError } from "../cardvault/client";
import { logger } from "../logger";
import { type CardPrint, CardPrintOutputSchema, UNTRUSTED_OUTPUT_NOTE } from "../schemas";
import { asOptionalString, asStringOrEmpty, formatLabel, pickPrimaryFace } from "../transform";

export function registerGetFabCardPrintsTool(server: McpServer): void {
	server.registerTool(
		"get_fab_card_prints",
		{
			title: "Get FaB Card Prints",
			description: `Retrieve all print variations of a specific card.

This tool provides:
- Information about different printings of the same card
- Language variants (English, Japanese, etc.)
- Set information and release details

Required input:
- cardId: Obtain this from the search_fab_cards tool first

${UNTRUSTED_OUTPUT_NOTE}`,
			inputSchema: z.object({ cardId: z.string().min(1).max(200) }),
			outputSchema: CardPrintOutputSchema,
		},
		async ({ cardId }: { cardId: string }) => {
			try {
				logger.info(
					{ tool: "get_fab_card_prints", action: "search_start", cardId },
					"Card prints search started",
				);

				const card = await fetchCardById(cardId);
				const cardPrints = card?.card_prints ?? [];

				const prints = cardPrints.reduce<CardPrint[]>((accumulator, cardPrint) => {
					const primaryFace = pickPrimaryFace(cardPrint.faces);
					const printId = asOptionalString(cardPrint.print_id);
					if (!printId) {
						return accumulator;
					}

					const finishTypeKeys = Array.from(
						new Set(
							(cardPrint.faces ?? [])
								.map((face) => asOptionalString(face.finish_type))
								.filter((finishType): finishType is string => Boolean(finishType)),
						),
					);

					accumulator.push({
						printId,
						cardId,
						name:
							asOptionalString(primaryFace?.printed_name) ??
							asOptionalString(cardPrint.print_id) ??
							cardId,
						displayName:
							asOptionalString(primaryFace?.printed_name) ??
							asOptionalString(cardPrint.print_id) ??
							cardId,
						pitch: asOptionalString(primaryFace?.printed_pitch),
						imageUrl: asStringOrEmpty(primaryFace?.image?.normal),
						imageUrlSmall: asStringOrEmpty(primaryFace?.image?.small),
						imageUrlLarge: asStringOrEmpty(primaryFace?.image?.large),
						layout: {
							key: asOptionalString(cardPrint.layout) ?? "unknown",
							label: formatLabel(asOptionalString(cardPrint.layout) ?? "unknown"),
						},
						finishTypes: finishTypeKeys.map((finishType) => ({
							key: finishType,
							label: formatLabel(finishType),
						})),
					});

					return accumulator;
				}, []);

				logger.info(
					{
						tool: "get_fab_card_prints",
						action: "api_response",
						resultCount: prints.length,
					},
					"API response received",
				);

				return {
					content: [{ type: "text" as const, text: JSON.stringify(prints, null, 2) }],
					structuredContent: prints,
				};
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error occurred";
				logger.error(
					{
						tool: "get_fab_card_prints",
						action: "error",
						error: errorMessage,
						cardId,
					},
					"Error while retrieving card prints",
				);
				logAxiosError("get_fab_card_prints", error);
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: A problem occurred while retrieving card print information - ${errorMessage}`,
						},
					],
					isError: true,
				};
			}
		},
	);
}
