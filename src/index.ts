import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import pino from "pino";

const CARDVAULT_API_BASE = "https://api.cardvault.fabtcg.com/carddb/api/v1";
const CARDVAULT_WEB_BASE = "https://cardvault.fabtcg.com";
const API_TIMEOUT_MS = 15000;

// ロガー設定
const logger = pino({
    level: "info",
    browser: {
        asObject: true,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
});

// 公開レスポンス型
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

interface ProductSummary {
    id: string;
    productName: string;
    slug?: string;
    language?: string;
    printedDate?: string;
    productType?: string;
    releaseDate?: string;
    description?: string;
}

interface ProductGroupSummary {
    id: string;
    groupName: string;
    productType?: string;
    releaseDate?: string;
    products: ProductSummary[];
}

// CardVault API 型
interface CardVaultImage {
    small?: string;
    normal?: string;
    large?: string;
}

interface CardVaultFace {
    face_id?: string;
    face_language?: string;
    finish_type?: string;
    printed_name?: string;
    printed_pitch?: number | string | null;
    printed_cost?: string | null;
    printed_power?: string | null;
    printed_defense?: string | null;
    printed_rules_text?: string | null;
    printed_typebox?: string | null;
    printed_artist?: string | null;
    image?: CardVaultImage;
    layout_position?: number;
}

interface CardVaultAdvancedSearchResult {
    card_id: string;
    print_id: string;
    printed_name?: string;
    printed_pitch?: number | string | null;
    printed_cost?: string | null;
    printed_power?: string | null;
    printed_defense?: string | null;
    printed_rules_text?: string | null;
    printed_typebox?: string | null;
    faces?: Array<{
        image?: CardVaultImage;
        layout_position?: number;
    }>;
}

interface CardVaultProduct {
    product_name?: string | null;
}

interface CardVaultPrintSet {
    set_name?: string | null;
}

interface CardVaultCardPrint {
    print_id?: string;
    print_language?: string | null;
    rarity?: string | null;
    layout?: string | null;
    is_default?: boolean;
    faces?: CardVaultFace[];
    product?: CardVaultProduct;
    print_set?: CardVaultPrintSet;
}

interface CardVaultCore {
    pitch?: string | null;
    cost?: string | null;
    power?: string | null;
    defense?: string | null;
}

interface CardVaultCardRecord {
    card_id?: string;
    cores?: CardVaultCore[];
    card_prints?: CardVaultCardPrint[];
}

interface CardVaultProductGroupProduct {
    id?: string;
    product_name?: string | null;
    slug?: string | null;
    printed_language?: string | null;
    printed_date?: string | null;
    product_type?: string | null;
    release_date?: string | null;
    description?: string | null;
}

interface CardVaultProductGroup {
    id?: string;
    group_name?: string | null;
    product_type?: string | null;
    release_date?: string | null;
    products?: CardVaultProductGroupProduct[];
}

interface CardVaultListResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

function asOptionalString(value: unknown): string | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }

    const stringValue = String(value).trim();
    return stringValue.length > 0 ? stringValue : undefined;
}

function asStringOrEmpty(value: unknown): string {
    return asOptionalString(value) ?? "";
}

function formatLabel(value: string): string {
    return value
        .split(/[-_\s]+/)
        .filter((word) => word.length > 0)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

function normalizeLanguageCode(code: string | null | undefined): string {
    return (asOptionalString(code) ?? "en").toUpperCase();
}

function pickPrimaryFace(
    faces: CardVaultFace[] | undefined,
    preferredFaceId?: string,
): CardVaultFace | undefined {
    const resolvedFaces = faces ?? [];

    if (preferredFaceId) {
        const matchedFace = resolvedFaces.find((face) => asOptionalString(face.face_id) === preferredFaceId);
        if (matchedFace) {
            return matchedFace;
        }
    }

    if (resolvedFaces.length === 0) {
        return undefined;
    }

    const sortedFaces = [...resolvedFaces].sort((left, right) => {
        const leftPosition = typeof left.layout_position === "number" ? left.layout_position : Number.MAX_SAFE_INTEGER;
        const rightPosition =
            typeof right.layout_position === "number" ? right.layout_position : Number.MAX_SAFE_INTEGER;
        return leftPosition - rightPosition;
    });

    return sortedFaces[0];
}

function findFaceByLanguage(cardPrints: CardVaultCardPrint[], languageCode: string): CardVaultFace | undefined {
    const normalizedLanguageCode = languageCode.toLowerCase();

    for (const cardPrint of cardPrints) {
        for (const face of cardPrint.faces ?? []) {
            const faceLanguage = asOptionalString(face.face_language)?.toLowerCase();
            if (faceLanguage === normalizedLanguageCode) {
                return face;
            }
        }
    }

    return undefined;
}

function buildVariants(cardId: string, cardPrints: CardVaultCardPrint[]): CardDetail["variants"] {
    type CardVariant = NonNullable<CardDetail["variants"]>[number];
    const variants = new Map<string, CardVariant>();

    for (const cardPrint of cardPrints) {
        const faces = cardPrint.faces ?? [];
        for (const face of faces) {
            const variantPrintId = asOptionalString(face.face_id) ?? asOptionalString(cardPrint.print_id);
            if (!variantPrintId || variants.has(variantPrintId)) {
                continue;
            }

            const language = normalizeLanguageCode(face.face_language ?? cardPrint.print_language);
            const setName =
                asOptionalString(cardPrint.product?.product_name) ??
                asOptionalString(cardPrint.print_set?.set_name) ??
                "";
            const finishType = asOptionalString(face.finish_type) ?? "regular";

            variants.set(variantPrintId, {
                printId: variantPrintId,
                language,
                setName,
                finishType,
                url: `${CARDVAULT_WEB_BASE}/card/${encodeURIComponent(cardId)}/${encodeURIComponent(variantPrintId)}`,
            });
        }
    }

    return Array.from(variants.values());
}

function parsePageNumberFromUrl(urlText: string | null): number | undefined {
    const resolvedUrlText = asOptionalString(urlText);
    if (!resolvedUrlText) {
        return undefined;
    }

    try {
        const url = new URL(resolvedUrlText);
        const pageParam = asOptionalString(url.searchParams.get("page"));
        if (!pageParam) {
            return undefined;
        }

        const parsedPage = Number.parseInt(pageParam, 10);
        return Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : undefined;
    } catch {
        return undefined;
    }
}

async function requestCardVault<T>(
    path: string,
    params?: Record<string, string | number | undefined>,
): Promise<T> {
    const response = await axios.get<T>(`${CARDVAULT_API_BASE}${path}`, {
        params,
        timeout: API_TIMEOUT_MS,
        headers: {
            Accept: "application/json",
        },
    });

    return response.data;
}

async function fetchCardById(cardId: string): Promise<CardVaultCardRecord | null> {
    const data = await requestCardVault<CardVaultListResponse<CardVaultCardRecord>>(
        `/card_id/${encodeURIComponent(cardId)}/`,
    );

    return data.results[0] ?? null;
}

function logAxiosError(tool: string, error: unknown): void {
    if (!axios.isAxiosError(error)) {
        return;
    }

    logger.error(
        {
            tool,
            action: "api_error_detail",
            status: error.response?.status,
            responseData: error.response?.data,
        },
        "API エラー詳細",
    );
}

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
    server = new McpServer({
        name: "Flesh and Blood Card Search API",
        version: "1.0.0",
        description:
            "Search cards, review print variations, browse product catalogs, and access detailed data from the Flesh and Blood Trading Card Game database",
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
                    logger.info(
                        {
                            tool: "search_fab_cards",
                            action: "search_start",
                            query,
                        },
                        "カード検索開始",
                    );

                    const data = await requestCardVault<CardVaultListResponse<CardVaultAdvancedSearchResult>>(
                        "/advanced-search/",
                        {
                            q: query,
                            page_size: 60,
                            orderby: "name",
                        },
                    );

                    logger.info(
                        {
                            tool: "search_fab_cards",
                            action: "api_response",
                            resultCount: data.results.length,
                        },
                        "API レスポンス受信",
                    );

                    const cards: Card[] = data.results.map((card) => {
                        const primaryFace = card.faces?.[0];
                        return {
                            id: card.card_id,
                            name: asOptionalString(card.printed_name) ?? card.card_id,
                            displayName: asOptionalString(card.printed_name) ?? card.card_id,
                            cardUrl: `${CARDVAULT_WEB_BASE}/card/${encodeURIComponent(card.card_id)}/${encodeURIComponent(card.print_id)}`,
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
                        content: [{
                            type: "text",
                            text: JSON.stringify(cards, null, 2),
                        }],
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

                    logger.error(
                        {
                            tool: "search_fab_cards",
                            action: "error",
                            error: errorMessage,
                            query,
                        },
                        "カード検索中にエラーが発生",
                    );
                    logAxiosError("search_fab_cards", error);

                    return {
                        content: [{
                            type: "text",
                            text: `エラー: カードの検索中に問題が発生しました - ${errorMessage}`,
                        }],
                    };
                }
            },
        );

        // Get all print variations of a specific card
        this.server.tool(
            "get_fab_card_prints",
            `Retrieve all print variations of a specific card.

This tool provides:
- Information about different printings of the same card
- Language variants (English, Japanese, etc.)
- Set information and release details

Required input:
- cardId: Obtain this from the search_fab_cards tool first`,
            { cardId: z.string() },
            async ({ cardId }) => {
                try {
                    logger.info(
                        {
                            tool: "get_fab_card_prints",
                            action: "search_start",
                            cardId,
                        },
                        "カードプリント検索開始",
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
                        "API レスポンス受信",
                    );

                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify(prints, null, 2),
                        }],
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

                    logger.error(
                        {
                            tool: "get_fab_card_prints",
                            action: "error",
                            error: errorMessage,
                            cardId,
                        },
                        "カードプリント取得中にエラーが発生",
                    );
                    logAxiosError("get_fab_card_prints", error);

                    return {
                        content: [{
                            type: "text",
                            text: `エラー: カードプリント情報の取得中に問題が発生しました - ${errorMessage}`,
                        }],
                    };
                }
            },
        );

        // カード詳細情報を取得
        this.server.tool(
            "get_card_detail",
            `Get detailed information about a specific card including non-English text.

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
- If the requested card or print combination does not exist, the tool returns an error message.`,
            {
                cardId: z.string(),
                printId: z.string().optional(),
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
                        "カード詳細取得開始",
                    );

                    const card = await fetchCardById(cardId);
                    if (!card) {
                        return {
                            content: [{
                                type: "text",
                                text: `エラー: cardId='${cardId}' に一致するカードが見つかりませんでした`,
                            }],
                        };
                    }

                    const resolvedCardId = asOptionalString(card.card_id) ?? cardId;
                    const cardPrints = card.card_prints ?? [];
                    if (cardPrints.length === 0) {
                        return {
                            content: [{
                                type: "text",
                                text: `エラー: cardId='${resolvedCardId}' に利用可能なカードプリントがありません`,
                            }],
                        };
                    }

                    let selectedPrint: CardVaultCardPrint | undefined;
                    let preferredFaceId: string | undefined;

                    if (printId) {
                        selectedPrint = cardPrints.find((cardPrint) => asOptionalString(cardPrint.print_id) === printId);
                        if (!selectedPrint) {
                            selectedPrint = cardPrints.find((cardPrint) =>
                                (cardPrint.faces ?? []).some((face) => asOptionalString(face.face_id) === printId),
                            );
                            preferredFaceId = printId;
                        }

                        if (!selectedPrint) {
                            return {
                                content: [{
                                    type: "text",
                                    text: `エラー: cardId='${resolvedCardId}' に printId='${printId}' は存在しません`,
                                }],
                            };
                        }
                    } else {
                        selectedPrint = cardPrints.find((cardPrint) => cardPrint.is_default) ?? cardPrints[0];
                    }

                    const selectedFace = pickPrimaryFace(selectedPrint.faces, preferredFaceId ?? printId);
                    const englishFace = findFaceByLanguage(cardPrints, "en");
                    const japaneseFace = findFaceByLanguage(cardPrints, "ja");

                    const resolvedPrintId =
                        asOptionalString(selectedFace?.face_id) ??
                        asOptionalString(selectedPrint.print_id) ??
                        printId ??
                        "";

                    const cardDetail: CardDetail = {
                        cardId: resolvedCardId,
                        printId: resolvedPrintId,
                        imageUrl: asStringOrEmpty(selectedFace?.image?.normal),
                        enName:
                            asOptionalString(englishFace?.printed_name) ??
                            asOptionalString(selectedFace?.printed_name) ??
                            resolvedCardId,
                        enText:
                            asOptionalString(englishFace?.printed_rules_text) ??
                            asOptionalString(selectedFace?.printed_rules_text),
                        enTypebox:
                            asOptionalString(englishFace?.printed_typebox) ??
                            asOptionalString(selectedFace?.printed_typebox),
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
                        content: [{
                            type: "text",
                            text: JSON.stringify(cardDetail, null, 2),
                        }],
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

                    logger.error(
                        {
                            tool: "get_card_detail",
                            action: "error",
                            error: errorMessage,
                            cardId,
                            printId: printId ?? null,
                        },
                        "カード詳細取得中にエラーが発生",
                    );
                    logAxiosError("get_card_detail", error);

                    if (error instanceof Error) {
                        logger.error(
                            {
                                tool: "get_card_detail",
                                action: "error_stack",
                                stack: error.stack,
                            },
                            "エラースタック情報",
                        );
                    }

                    return {
                        content: [{
                            type: "text",
                            text: `エラー: カード詳細情報の取得中に問題が発生しました - ${errorMessage}`,
                        }],
                    };
                }
            },
        );

        // CardVault の製品グループ一覧を取得
        this.server.tool(
            "get_fab_products",
            `Retrieve product groups from cardvault.fabtcg.com/products.

This tool provides:
- Product groups and their nested product entries
- Product metadata (language, slug, printed/release date, type)
- Pagination metadata for navigating large result sets

Input:
- page (optional): Page number (default: 1)`,
            {
                page: z.number().int().min(1).optional(),
            },
            async ({ page }) => {
                const resolvedPage = page ?? 1;

                try {
                    logger.info(
                        {
                            tool: "get_fab_products",
                            action: "fetch_start",
                            page: resolvedPage,
                        },
                        "製品一覧取得開始",
                    );

                    const data = await requestCardVault<CardVaultListResponse<CardVaultProductGroup>>(
                        "/product-groups-products/",
                        { page: resolvedPage },
                    );

                    const productGroups: ProductGroupSummary[] = data.results.map((group) => ({
                        id: asOptionalString(group.id) ?? "",
                        groupName: asOptionalString(group.group_name) ?? "",
                        productType: asOptionalString(group.product_type),
                        releaseDate: asOptionalString(group.release_date),
                        products: (group.products ?? []).map((product) => ({
                            id: asOptionalString(product.id) ?? "",
                            productName: asOptionalString(product.product_name) ?? "",
                            slug: asOptionalString(product.slug),
                            language: asOptionalString(product.printed_language)?.toUpperCase(),
                            printedDate: asOptionalString(product.printed_date),
                            productType: asOptionalString(product.product_type),
                            releaseDate: asOptionalString(product.release_date),
                            description: asOptionalString(product.description),
                        })),
                    }));

                    logger.info(
                        {
                            tool: "get_fab_products",
                            action: "api_response",
                            page: resolvedPage,
                            resultCount: data.results.length,
                            totalCount: data.count,
                        },
                        "製品一覧APIレスポンス受信",
                    );

                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify(
                                {
                                    page: resolvedPage,
                                    count: data.count,
                                    next: data.next,
                                    previous: data.previous,
                                    nextPage: parsePageNumberFromUrl(data.next),
                                    previousPage: parsePageNumberFromUrl(data.previous),
                                    productGroups,
                                },
                                null,
                                2,
                            ),
                        }],
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
                    const axiosStatus =
                        axios.isAxiosError(error) && typeof error.response?.status === "number"
                            ? error.response.status
                            : undefined;
                    const isInvalidPageError = axiosStatus === 404;

                    logger.error(
                        {
                            tool: "get_fab_products",
                            action: "error",
                            error: errorMessage,
                            page: resolvedPage,
                            status: axiosStatus ?? null,
                        },
                        "製品一覧取得中にエラーが発生",
                    );
                    logAxiosError("get_fab_products", error);

                    return {
                        content: [{
                            type: "text",
                            text: isInvalidPageError
                                ? `エラー: page=${resolvedPage} は無効です。別のページ番号を指定してください。`
                                : `エラー: 製品一覧の取得中に問題が発生しました - ${errorMessage}`,
                        }],
                    };
                }
            },
        );

        // ChatGPT向けに追加していた OpenAI 互換ツールは削除しました
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
                    "A Model Context Protocol server that provides card search, print variation listings, product catalogs, and detailed information for the Flesh and Blood Trading Card Game database.",
                endpoints: {
                    sse: { url: `${origin}/sse` },
                    rpc: { url: `${origin}/mcp` },
                },
            };

            return new Response(request.method === "HEAD" ? null : JSON.stringify(manifest, null, 2), {
                status: 200,
                headers: {
                    "content-type": "application/json; charset=utf-8",
                    "cache-control": "public, max-age=300",
                },
            });
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
