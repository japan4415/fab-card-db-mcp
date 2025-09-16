import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";
import pino from "pino";

// ロガー設定
const logger = pino({
	level: 'info',
	browser: {
		asObject: true,
	},
	timestamp: pino.stdTimeFunctions.isoTime,
});

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
					logger.info({
						tool: 'search_fab_cards',
						action: 'search_start',
						query: query
					}, 'カード検索開始');
					
					const url = `https://cards.fabtcg.com/api/search/v1/cards/?q=${encodeURIComponent(query)}`;
					logger.info({
						tool: 'search_fab_cards',
						action: 'api_request',
						url: url
					}, 'API リクエスト送信');
					
					const response = await axios.get(url);
					logger.info({
						tool: 'search_fab_cards',
						action: 'api_response',
						status: response.status,
						resultCount: response.data.results?.length || 0
					}, 'API レスポンス受信');
					
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
					
					logger.error({
						tool: 'search_fab_cards',
						action: 'error',
						error: errorMessage,
						query: query
					}, 'カード検索中にエラーが発生');
					
					if (error instanceof Error && 'response' in error) {
						// @ts-ignore
						const responseData = error.response?.data;
						// @ts-ignore
						const responseStatus = error.response?.status;
						logger.error({
							tool: 'search_fab_cards',
							action: 'api_error_detail',
							status: responseStatus,
							responseData: responseData
						}, 'API エラー詳細');
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
					logger.info({
						tool: 'get_fab_card_prints',
						action: 'search_start',
						cardId: cardId
					}, 'カードプリント検索開始');
					
					const url = `https://cards.fabtcg.com/api/fab/v1/prints/?card_id=${encodeURIComponent(cardId)}`;
					logger.info({
						tool: 'get_fab_card_prints',
						action: 'api_request',
						url: url
					}, 'API リクエスト送信');
					
					const response = await axios.get(url);
					logger.info({
						tool: 'get_fab_card_prints',
						action: 'api_response',
						status: response.status,
						resultCount: response.data.results?.length || 0
					}, 'API レスポンス受信');
					
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
					
					logger.error({
						tool: 'get_fab_card_prints',
						action: 'error',
						error: errorMessage,
						cardId: cardId
					}, 'カードプリント取得中にエラーが発生');
					
					if (error instanceof Error && 'response' in error) {
						// @ts-ignore
						const responseData = error.response?.data;
						// @ts-ignore
						const responseStatus = error.response?.status;
						logger.error({
							tool: 'get_fab_card_prints',
							action: 'api_error_detail',
							status: responseStatus,
							responseData: responseData
						}, 'API エラー詳細');
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
					logger.info({
						tool: 'get_card_detail',
						action: 'detail_start',
						cardId: cardId,
						printId: printId || null
					}, 'カード詳細取得開始');
					
					let url: string;
					
					if (printId) {
						// プリントIDが指定されている場合はそれを使用
						url = `https://cards.fabtcg.com/card/${encodeURIComponent(cardId)}/${encodeURIComponent(printId)}/`;
					} else {
						// プリントIDが指定されていない場合はカードIDのみでアクセス
						url = `https://cards.fabtcg.com/card/${encodeURIComponent(cardId)}/`;
					}
					
					logger.info({
						tool: 'get_card_detail',
						action: 'page_request',
						url: url
					}, 'ページリクエスト送信');
					
					const response = await axios.get(url);
					logger.info({
						tool: 'get_card_detail',
						action: 'page_response',
						status: response.status,
						contentLength: response.data.length
					}, 'ページレスポンス受信');
					
					const $ = cheerio.load(response.data);
					logger.info({
						tool: 'get_card_detail',
						action: 'html_parse_start'
					}, 'HTML解析開始');
					
					// 基本情報の抽出
					const imageUrl = $('.card-details__face img').attr('src') || '';
					logger.debug({
						tool: 'get_card_detail',
						action: 'extract_image',
						imageUrl: imageUrl
					}, '画像URL抽出');
					
					const currentPrintId = $('.card-details__variant [data-component-variant-is-current]')
						.parent().find('[data-component-variant-print-id]').text();
					logger.debug({
						tool: 'get_card_detail',
						action: 'extract_print_id',
						currentPrintId: currentPrintId || null
					}, '現在のプリントID抽出');
					
					// 英語情報の抽出（rules タブ）
					const rulesTab = $('[data-component-tab="rules"]');
					const enName = rulesTab.find('.card-details-data__title-text').text().trim();
					const enText = rulesTab.find('.card-details-data__blurb div').text().trim();
					const enTypebox = rulesTab.find('.card-details-data__footer-text').text().trim();
					logger.debug({
						tool: 'get_card_detail',
						action: 'extract_english_info',
						enName: enName,
						enTextLength: enText.length
					}, '英語情報抽出');
					
					// 日本語情報の抽出（print タブ）
					const printTab = $('[data-component-tab="print"]');
					const jaName = printTab.find('.card-details-data__title-text').text().trim();
					const jaText = printTab.find('.card-details-data__blurb div').text().trim();
					const jaTypebox = printTab.find('.card-details-data__footer-text').text().trim();
					logger.debug({
						tool: 'get_card_detail',
						action: 'extract_japanese_info',
						jaName: jaName,
						jaTextLength: jaText.length
					}, '日本語情報抽出');
					
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
					logger.debug({
						tool: 'get_card_detail',
						action: 'variant_count_check',
						variantCount: variantCount
					}, 'バリエーション数確認');
					
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
					
					logger.debug({
						tool: 'get_card_detail',
						action: 'variants_extracted',
						variantCount: variants.length
					}, 'バリエーション抽出完了');
					
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
					
					logger.error({
						tool: 'get_card_detail',
						action: 'error',
						error: errorMessage,
						cardId: cardId,
						printId: printId || null
					}, 'カード詳細取得中にエラーが発生');
					
					if (error instanceof Error && 'response' in error) {
						// @ts-ignore
						const responseData = error.response?.data;
						// @ts-ignore
						const responseStatus = error.response?.status;
						logger.error({
							tool: 'get_card_detail',
							action: 'api_error_detail',
							status: responseStatus,
							responseData: responseData
						}, 'API エラー詳細');
					} else if (error instanceof Error) {
						logger.error({
							tool: 'get_card_detail',
							action: 'error_stack',
							stack: error.stack
						}, 'エラースタック情報');
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

		// OpenAI ChatGPT compatible search tool
		this.server.tool(
			"search",
			`Search for documents using OpenAI Vector Store search format.
			
This tool searches through the Flesh and Blood card database to find semantically relevant matches.
Returns a list of search results with basic information. Use the fetch tool to get
complete document content.`,
			{ query: z.string() },
			async ({ query }) => {
				try {
					logger.info({
						tool: 'search',
						action: 'search_start',
						query: query
					}, 'OpenAI形式検索開始');
					
					const url = `https://cards.fabtcg.com/api/search/v1/cards/?q=${encodeURIComponent(query)}`;
					const response = await axios.get(url);
					
					const data = response.data;
					const results = data.results.slice(0, 10).map((card: any) => ({
						id: card.card_id,
						title: card.display_name || card.name,
						text: `${card.typebox || ''} ${card.text || ''}`.trim() || card.display_name,
						url: `https://cards.fabtcg.com${card.url}`
					}));
					
					logger.info({
						tool: 'search',
						action: 'search_complete',
						resultCount: results.length
					}, 'OpenAI形式検索完了');
					
					return {
						content: [{ 
							type: "text", 
							text: JSON.stringify({ results }, null, 2)
						}],
					};
				} catch (error) {
					const errorMessage = error instanceof Error 
						? error.message 
						: 'Unknown error occurred';
					
					logger.error({
						tool: 'search',
						action: 'error',
						error: errorMessage,
						query: query
					}, 'OpenAI形式検索中にエラーが発生');
					
					return {
						content: [{ 
							type: "text", 
							text: JSON.stringify({ results: [] }, null, 2)
						}],
					};
				}
			}
		);

		// OpenAI ChatGPT compatible fetch tool
		this.server.tool(
			"fetch",
			`Retrieve complete document content by ID for detailed analysis and citation.
			
This tool fetches the full document content from Flesh and Blood card database.
Use this after finding relevant documents with the search tool to get complete
information for analysis and proper citation.`,
			{ id: z.string() },
			async ({ id }) => {
				try {
					logger.info({
						tool: 'fetch',
						action: 'fetch_start',
						id: id
					}, 'OpenAI形式取得開始');
					
					// First get basic card info
					const searchUrl = `https://cards.fabtcg.com/api/search/v1/cards/?q=${encodeURIComponent(id)}`;
					const searchResponse = await axios.get(searchUrl);
					
					// Find exact match by card_id
					const card = searchResponse.data.results.find((c: any) => c.card_id === id);
					if (!card) {
						throw new Error(`Card with ID ${id} not found`);
					}
					
					// Get detailed card information by scraping the card page
					const cardUrl = `https://cards.fabtcg.com/card/${encodeURIComponent(id)}/`;
					const pageResponse = await axios.get(cardUrl);
					const $ = cheerio.load(pageResponse.data);
					
					// Extract detailed information
					const rulesTab = $('[data-component-tab="rules"]');
					const enName = rulesTab.find('.card-details-data__title-text').text().trim();
					const enText = rulesTab.find('.card-details-data__blurb div').text().trim();
					const enTypebox = rulesTab.find('.card-details-data__footer-text').text().trim();
					
					// Get attributes
					const pitch = card.pitch || '';
					const cost = card.cost || '';
					const power = card.power || '';
					const defense = card.defense || '';
					
					// Build comprehensive text content
					let fullText = `Card Name: ${enName}\n`;
					if (enTypebox) fullText += `Type: ${enTypebox}\n`;
					if (pitch) fullText += `Pitch: ${pitch}\n`;
					if (cost) fullText += `Cost: ${cost}\n`;
					if (power) fullText += `Power: ${power}\n`;
					if (defense) fullText += `Defense: ${defense}\n`;
					if (enText) fullText += `\nCard Text:\n${enText}`;
					
					// Get publication info
					const productionInfo = $('.card-details__production-details-wrapper p:first-child').text();
					const [set, rarity] = productionInfo.split('•').map((item: string) => item.trim());
					const artist = $('.card-details__production-details-wrapper p:last-child a').text().trim();
					
					const metadata = {
						cardId: id,
						pitch,
						cost,
						power,
						defense,
						set,
						rarity,
						artist,
						typebox: enTypebox
					};
					
					const result = {
						id,
						title: enName || card.display_name || card.name,
						text: fullText,
						url: `https://cards.fabtcg.com${card.url}`,
						metadata
					};
					
					logger.info({
						tool: 'fetch',
						action: 'fetch_complete',
						id: id
					}, 'OpenAI形式取得完了');
					
					return {
						content: [{ 
							type: "text", 
							text: JSON.stringify(result, null, 2)
						}],
					};
				} catch (error) {
					const errorMessage = error instanceof Error 
						? error.message 
						: 'Unknown error occurred';
					
					logger.error({
						tool: 'fetch',
						action: 'error',
						error: errorMessage,
						id: id
					}, 'OpenAI形式取得中にエラーが発生');
					
					return {
						content: [{ 
							type: "text", 
							text: `エラー: ドキュメントの取得中に問題が発生しました - ${errorMessage}` 
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

                if (url.pathname === "/.well-known/mcp.json") {
                        if (request.method !== "GET" && request.method !== "HEAD") {
                                return new Response(null, {
                                        status: 405,
                                        headers: {
                                                Allow: "GET, HEAD",
                                        },
                                });
                        }

                        const origin = url.origin;
                        const manifest = {
                                name: "Flesh and Blood Card Search API",
                                version: "1.0.0",
                                description:
                                        "A Model Context Protocol server that provides search and lookup tools for the Flesh and Blood Trading Card Game database.",
                                endpoints: {
                                        sse: { url: `${origin}/sse` },
                                        rpc: { url: `${origin}/mcp` },
                                },
                        };

                        return new Response(
                                request.method === "HEAD" ? null : JSON.stringify(manifest, null, 2),
                                {
                                        status: 200,
                                        headers: {
                                                "content-type": "application/json; charset=utf-8",
                                                "cache-control": "public, max-age=300",
                                        },
                                },
                        );
                }

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
