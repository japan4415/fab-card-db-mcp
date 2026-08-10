import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { CARDVAULT_WEB_BASE, logAxiosError, requestCardVault } from "../cardvault/client";
import type { CardVaultAdvancedSearchResult, CardVaultListResponse } from "../cardvault/types";
import { logger } from "../logger";
import { type Card, CardOutputSchema, UNTRUSTED_OUTPUT_NOTE } from "../schemas";
import { asOptionalString, asStringOrEmpty } from "../transform";

export function registerSearchFabCardsTool(server: McpServer): void {
	server.registerTool(
		"search_fab_cards",
		{
			title: "Search FaB Cards",
			description: `Search for cards in the Flesh and Blood TCG.

This tool:
- Returns a list of cards matching the search query
- Supports searching by card name, type, or text
- Uses partial string matching for flexible searches

For best results, use short and specific search terms.

${UNTRUSTED_OUTPUT_NOTE}`,
			inputSchema: z.object({ query: z.string().min(1).max(200) }),
			outputSchema: CardOutputSchema,
		},
		async ({ query }: { query: string }) => {
			try {
				logger.info(
					{ tool: "search_fab_cards", action: "search_start", query },
					"Card search started",
				);

				const data = await requestCardVault<
					CardVaultListResponse<CardVaultAdvancedSearchResult>
				>("/advanced-search/", {
					q: query,
					page_size: 60,
					orderby: "name",
				});

				logger.info(
					{
						tool: "search_fab_cards",
						action: "api_response",
						resultCount: data.results.length,
					},
					"API response received",
				);

				const cards: Card[] = data.results.map((card) => {
					const primaryFace = card.faces?.[0];
					return {
						id: card.card_id,
						name: asOptionalString(card.printed_name) ?? card.card_id,
						displayName: asOptionalString(card.printed_name) ?? card.card_id,
						cardUrl: `${CARDVAULT_WEB_BASE}/card/${encodeURIComponent(
							card.card_id,
						)}/${encodeURIComponent(card.print_id)}`,
						imageUrl: asStringOrEmpty(primaryFace?.image?.normal),
						pitch: asOptionalString(card.printed_pitch),
						cost: asOptionalString(card.printed_cost),
						power: asOptionalString(card.printed_power),
						defense: asOptionalString(card.printed_defense),
						text: asOptionalString(card.printed_rules_text),
						typebox: asOptionalString(card.printed_typebox),
					};
				});

				return {
					content: [{ type: "text" as const, text: JSON.stringify(cards, null, 2) }],
					structuredContent: cards,
				};
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error occurred";
				logger.error(
					{ tool: "search_fab_cards", action: "error", error: errorMessage, query },
					"Error during card search",
				);
				logAxiosError("search_fab_cards", error);
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: A problem occurred while searching for cards - ${errorMessage}`,
						},
					],
					isError: true,
				};
			}
		},
	);
}
