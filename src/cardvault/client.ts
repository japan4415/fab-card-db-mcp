import axios from "axios";
import { logger } from "../logger";
import type { CardVaultCardRecord, CardVaultListResponse } from "./types";

export const CARDVAULT_API_BASE = "https://api.cardvault.fabtcg.com/carddb/api/v1";
export const CARDVAULT_WEB_BASE = "https://cardvault.fabtcg.com";
const API_TIMEOUT_MS = 15000;

export async function requestCardVault<T>(
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

export async function fetchCardById(cardId: string): Promise<CardVaultCardRecord | null> {
	const data = await requestCardVault<CardVaultListResponse<CardVaultCardRecord>>(
		`/card_id/${encodeURIComponent(cardId)}/`,
	);

	return data.results[0] ?? null;
}

export function logAxiosError(tool: string, error: unknown): void {
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
		"API error detail",
	);
}
