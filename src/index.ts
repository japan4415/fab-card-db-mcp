import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";

// カード情報のインターフェース
interface Card {
  id: string;
  name: string;
  displayName: string;
  cardUrl: string;
  imageUrl: string;
  pitch?: string;
  cost?: string;
  power?: string;
  defense?: string;
  text?: string;
  textHtml?: string;
  typebox?: string;
}

// カードプリント情報のインターフェース
interface CardPrint {
  printId: string;
  cardId: string;
  name: string;
  displayName: string;
  pitch?: string;
  imageUrl: string;
  imageUrlSmall: string;
  imageUrlLarge: string;
  layout: {
    key: string;
    label: string;
  };
  finishTypes: Array<{
    key: string;
    label: string;
  }>;
}

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Flesh and Blood Card Search API",
		version: "1.0.0",
	});

	async init() {
		// Search Flesh and Blood TCG cards using the API
		this.server.tool(
			"search_fab_cards",
			{ query: z.string() },
			async ({ query }) => {
				try {
					const url = `https://cards.fabtcg.com/api/search/v1/cards/?name=${encodeURIComponent(query)}`;
					const response = await axios.get(url);
					
					// APIからのレスポンスをパース
					const data = response.data;
					const cards: Card[] = data.results.map((card: any) => ({
						id: card.card_id,
						name: card.name,
						displayName: card.display_name,
						cardUrl: `https://cards.fabtcg.com${card.url}`,
						imageUrl: card.image.normal,
						pitch: card.pitch,
						cost: card.cost,
						power: card.power,
						defense: card.defense,
						text: card.text,
						textHtml: card.text_html,
						typebox: card.typebox
					}));
					
					return {
						content: [{ 
							type: "text", 
							text: JSON.stringify(cards, null, 2)
						}],
					};
				} catch (error) {
					console.error('Error searching FAB cards:', error);
					const errorMessage = error instanceof Error 
						? error.message 
						: 'Unknown error occurred';
					return {
						content: [{ 
							type: "text", 
							text: `エラー: カードの検索中に問題が発生しました - ${errorMessage}` 
						}],
					};
				}
			}
		);

		// Get all print variations of a specific card
		this.server.tool(
			"get_fab_card_prints",
			{ cardId: z.string() },
			async ({ cardId }) => {
				try {
					const url = `https://cards.fabtcg.com/api/fab/v1/prints/?card_id=${encodeURIComponent(cardId)}`;
					const response = await axios.get(url);
					
					// APIからのレスポンスをパース
					const data = response.data;
					const prints: CardPrint[] = data.results.map((print: any) => ({
						printId: print.print_id,
						cardId: print.card_id,
						name: print.name,
						displayName: print.display_name,
						pitch: print.pitch,
						imageUrl: print.image.normal,
						imageUrlSmall: print.image.small,
						imageUrlLarge: print.image.large,
						layout: print.layout,
						finishTypes: print.finish_types
					}));
					
					return {
						content: [{ 
							type: "text", 
							text: JSON.stringify(prints, null, 2)
						}],
					};
				} catch (error) {
					console.error('Error fetching FAB card prints:', error);
					const errorMessage = error instanceof Error 
						? error.message 
						: 'Unknown error occurred';
					return {
						content: [{ 
							type: "text", 
							text: `エラー: カードプリント情報の取得中に問題が発生しました - ${errorMessage}` 
						}],
					};
				}
			}
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			// @ts-ignore
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			// @ts-ignore
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
