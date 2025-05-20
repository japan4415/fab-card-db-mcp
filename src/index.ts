import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";

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

// カード詳細情報のインターフェース
interface CardDetail {
  cardId: string;
  printId: string;
  imageUrl: string;
  
  // 英語情報
  enName: string;
  enText?: string;
  enTypebox?: string;
  
  // 日本語情報
  jaName?: string;
  jaText?: string;
  jaTypebox?: string;
  
  // カード属性
  pitch?: string;
  cost?: string;
  power?: string;
  defense?: string;
  
  // 出版情報
  set?: string;
  rarity?: string;
  artist?: string;
  
  // バリエーション情報
  variants?: Array<{
    printId: string;
    language: string;
    setName: string;
    finishType: string;
    url: string;
  }>;
}

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Flesh and Blood Card Search API",
		version: "1.0.0",
		description: "Access card information from the Flesh and Blood Trading Card Game database"
	});

	async init() {
		// Search Flesh and Blood TCG cards using the API
		this.server.tool(
			"search_fab_cards",
			`Search for cards in the Flesh and Blood TCG.

This tool:
- Returns a list of cards matching the search query
- Supports searching by card name, type, or text
- Uses partial string matching for flexible searches

For best results, use short and specific search terms.`,
			{ query: z.string() },
			async ({ query }) => {
				try {
					console.log(`[search_fab_cards] 検索開始: query=${query}`);
					const url = `https://cards.fabtcg.com/api/search/v1/cards/?q=${encodeURIComponent(query)}`;
					console.log(`[search_fab_cards] APIリクエスト: url=${url}`);
					
					const response = await axios.get(url);
					console.log(`[search_fab_cards] APIレスポンス: status=${response.status}, データ件数=${response.data.results?.length || 0}`);
					
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
					const errorMessage = error instanceof Error 
						? error.message 
						: 'Unknown error occurred';
					console.error(`[search_fab_cards] エラー発生: ${errorMessage}`);
					if (error instanceof Error && 'response' in error) {
						// @ts-ignore
						const responseData = error.response?.data;
						// @ts-ignore
						const responseStatus = error.response?.status;
						console.error(`[search_fab_cards] レスポンス詳細: status=${responseStatus}, data=`, responseData);
					}
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
			`Retrieve all print variations of a specific card.

This tool provides:
- Information about different printings of the same card
- Language variants (English, Japanese, etc.)
- Set information and release details
- Finish types (regular, rainbow foil, etc.)

Required input:
- cardId: Obtain this from the search_fab_cards tool first`,
			{ cardId: z.string() },
			async ({ cardId }) => {
				try {
					console.log(`[get_fab_card_prints] 検索開始: cardId=${cardId}`);
					const url = `https://cards.fabtcg.com/api/fab/v1/prints/?card_id=${encodeURIComponent(cardId)}`;
					console.log(`[get_fab_card_prints] APIリクエスト: url=${url}`);
					
					const response = await axios.get(url);
					console.log(`[get_fab_card_prints] APIレスポンス: status=${response.status}, データ件数=${response.data.results?.length || 0}`);
					
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
					const errorMessage = error instanceof Error 
						? error.message 
						: 'Unknown error occurred';
					console.error(`[get_fab_card_prints] エラー発生: ${errorMessage}`);
					if (error instanceof Error && 'response' in error) {
						// @ts-ignore
						const responseData = error.response?.data;
						// @ts-ignore
						const responseStatus = error.response?.status;
						console.error(`[get_fab_card_prints] レスポンス詳細: status=${responseStatus}, data=`, responseData);
					}
					return {
						content: [{ 
							type: "text", 
							text: `エラー: カードプリント情報の取得中に問題が発生しました - ${errorMessage}` 
						}],
					};
				}
			}
		);

		// カード詳細情報を取得
		this.server.tool(
			"get_card_detail",
			`Get detailed information about a specific card including non-English text.

This tool provides:
- Complete card data in English and other languages (when available)
- Card attributes (pitch, power, defense, cost)
- Publication details (set, rarity, artist)
- All available card variations

IMPORTANT USAGE SEQUENCE AND WARNINGS:
1. FIRST use search_fab_cards to get the cardId.
2. THEN use get_fab_card_prints with that cardId to check available print variations. This is the ONLY way to find the correct printId for a specific language (e.g., Japanese).
3. ONLY THEN use this tool with both the cardId and the ACCURATE printId obtained from get_fab_card_prints.

DO NOT attempt to guess or predict the printId. If you need a card in a specific language (e.g., Japanese), you MUST use get_fab_card_prints to find the correct printId for that language. If a specific language variant (e.g. Japanese) or its printId does not appear in the get_fab_card_prints results, the card is not available in that language, and you should NOT use this tool for that language.`,
			{ 
				cardId: z.string(), 
				printId: z.string().optional() 
			},
			async ({ cardId, printId }: { cardId: string; printId?: string }) => {
				try {
					console.log(`[get_card_detail] 検索開始: cardId=${cardId}, printId=${printId || 'なし'}`);
					let url: string;
					
					if (printId) {
						// プリントIDが指定されている場合はそれを使用
						url = `https://cards.fabtcg.com/card/${encodeURIComponent(cardId)}/${encodeURIComponent(printId)}/`;
					} else {
						// プリントIDが指定されていない場合はカードIDのみでアクセス
						url = `https://cards.fabtcg.com/card/${encodeURIComponent(cardId)}/`;
					}
					
					console.log(`[get_card_detail] ページリクエスト: url=${url}`);
					const response = await axios.get(url);
					console.log(`[get_card_detail] ページレスポンス: status=${response.status}, contentLength=${response.data.length}`);
					
					const $ = cheerio.load(response.data);
					console.log(`[get_card_detail] HTML解析開始`);
					
					// 基本情報の抽出
					const imageUrl = $('.card-details__face img').attr('src') || '';
					console.log(`[get_card_detail] 画像URL: ${imageUrl}`);
					
					const currentPrintId = $('.card-details__variant [data-component-variant-is-current]')
						.parent().find('[data-component-variant-print-id]').text();
					console.log(`[get_card_detail] 現在のプリントID: ${currentPrintId || 'なし'}`);
					
					// 英語情報の抽出（rules タブ）
					const rulesTab = $('[data-component-tab="rules"]');
					const enName = rulesTab.find('.card-details-data__title-text').text().trim();
					const enText = rulesTab.find('.card-details-data__blurb div').text().trim();
					const enTypebox = rulesTab.find('.card-details-data__footer-text').text().trim();
					console.log(`[get_card_detail] 英語情報: name=${enName}, text長さ=${enText.length}`);
					
					// 日本語情報の抽出（print タブ）
					const printTab = $('[data-component-tab="print"]');
					const jaName = printTab.find('.card-details-data__title-text').text().trim();
					const jaText = printTab.find('.card-details-data__blurb div').text().trim();
					const jaTypebox = printTab.find('.card-details-data__footer-text').text().trim();
					console.log(`[get_card_detail] 日本語情報: name=${jaName}, text長さ=${jaText.length}`);
					
					// カード属性の抽出
					const pitch = $('.card-details-data__corner:contains("ピッチ:")').text().replace(/[^0-9]/g, '') || 
								rulesTab.find('.card-details-data__corner:first-child span:last-child').text().trim();
					const cost = rulesTab.find('.card-details-data__corner:contains("Cost") span').text().trim();
					const power = rulesTab.find('.card-details-data__corner:contains("パワー") span').text().trim() || 
								rulesTab.find('.card-details-data__footer .card-details-data__corner:first-child span:last-child').text().trim();
					const defense = rulesTab.find('.card-details-data__corner:contains("防御") span').text().trim() || 
								rulesTab.find('.card-details-data__footer .card-details-data__corner:last-child span:first-child').text().trim();
					
					// 出版情報の抽出
					const productionInfo = $('.card-details__production-details-wrapper p:first-child').text();
					const [set, rarity] = productionInfo.split('•').map((item: string) => item.trim());
					const artist = $('.card-details__production-details-wrapper p:last-child a').text().trim();
					
					// バリエーション情報の抽出
					const variants: Array<{printId: string; language: string; setName: string; finishType: string; url: string}> = [];
					const variantCount = $('[data-component-variant]').length;
					console.log(`[get_card_detail] バリエーション数: ${variantCount}`);
					
					$('[data-component-variant]').each((_: number, element: any) => {
						const $el = $(element);
						const variantPrintId = $el.find('[data-component-variant-print-id]').text();
						const variantSetName = $el.find('[data-component-variant-name]').text();
						const variantFinishType = $el.find('[data-component-variant-finish-type-display]').text();
						const variantUrl = $el.find('[data-component-variant-link]').text();
						const languageMatch = variantPrintId.match(/^([A-Z]{2})_/);
						const language = languageMatch ? languageMatch[1] : 'EN';
						
						if (variantPrintId && variantUrl) {
							variants.push({
								printId: variantPrintId,
								language,
								setName: variantSetName,
								finishType: variantFinishType,
								url: `https://cards.fabtcg.com${variantUrl}`
							});
						}
					});
					
					console.log(`[get_card_detail] 抽出されたバリエーション数: ${variants.length}`);
					
					// カード詳細情報の作成
					const cardDetail: CardDetail = {
						cardId,
						printId: currentPrintId || printId || '',
						imageUrl,
						enName,
						enText,
						enTypebox,
						jaName,
						jaText,
						jaTypebox,
						pitch,
						cost,
						power,
						defense,
						set,
						rarity,
						artist,
						variants
					};
					
					return {
						content: [{ 
							type: "text", 
							text: JSON.stringify(cardDetail, null, 2)
						}],
					};
				} catch (error) {
					const errorMessage = error instanceof Error 
						? error.message 
						: 'Unknown error occurred';
					console.error(`[get_card_detail] エラー発生: ${errorMessage}`);
					if (error instanceof Error && 'response' in error) {
						// @ts-ignore
						const responseData = error.response?.data;
						// @ts-ignore
						const responseStatus = error.response?.status;
						console.error(`[get_card_detail] レスポンス詳細: status=${responseStatus}, data=`, responseData);
					} else if (error instanceof Error) {
						console.error(`[get_card_detail] エラースタック: ${error.stack}`);
					}
					return {
						content: [{ 
							type: "text", 
							text: `エラー: カード詳細情報の取得中に問題が発生しました - ${errorMessage}` 
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
