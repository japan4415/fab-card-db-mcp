import type { McpServer } from "@modelcontextprotocol/server";
import axios from "axios";
import { z } from "zod";
import { logAxiosError, requestCardVault } from "../cardvault/client";
import type { CardVaultListResponse, CardVaultProductGroup } from "../cardvault/types";
import { logger } from "../logger";
import { type ProductGroupSummary, ProductsOutputSchema, UNTRUSTED_OUTPUT_NOTE } from "../schemas";
import { asOptionalString, parsePageNumberFromUrl } from "../transform";

export function registerGetFabProductsTool(server: McpServer): void {
	server.registerTool(
		"get_fab_products",
		{
			title: "Get FaB Products",
			description: `Retrieve product groups from cardvault.fabtcg.com/products.

This tool provides:
- Product groups and their nested product entries
- Product metadata (language, slug, printed/release date, type)
- Pagination metadata for navigating large result sets

Input:
- page (optional): Page number (default: 1)

${UNTRUSTED_OUTPUT_NOTE}`,
			inputSchema: z.object({
				page: z.number().int().min(1).optional(),
			}),
			outputSchema: ProductsOutputSchema,
		},
		async ({ page }: { page?: number }) => {
			const resolvedPage = page ?? 1;

			try {
				logger.info(
					{
						tool: "get_fab_products",
						action: "fetch_start",
						page: resolvedPage,
					},
					"Products list retrieval started",
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
					"Products list API response received",
				);

				const result = {
					page: resolvedPage,
					count: data.count,
					next: data.next,
					previous: data.previous,
					nextPage: parsePageNumberFromUrl(data.next),
					previousPage: parsePageNumberFromUrl(data.previous),
					productGroups,
				};

				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(result, null, 2),
						},
					],
					structuredContent: result,
				};
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error occurred";
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
					"Error while retrieving products list",
				);
				logAxiosError("get_fab_products", error);

				return {
					content: [
						{
							type: "text" as const,
							text: isInvalidPageError
								? `Error: page=${resolvedPage} is invalid. Please specify a different page number.`
								: `Error: A problem occurred while retrieving the products list - ${errorMessage}`,
						},
					],
					isError: true,
				};
			}
		},
	);
}
