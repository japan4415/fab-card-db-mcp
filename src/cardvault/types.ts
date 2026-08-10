// CardVault API 型
export interface CardVaultImage {
	small?: string;
	normal?: string;
	large?: string;
}

export interface CardVaultFace {
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

export interface CardVaultAdvancedSearchResult {
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

export interface CardVaultProduct {
	product_name?: string | null;
}

export interface CardVaultPrintSet {
	set_name?: string | null;
}

export interface CardVaultCardPrint {
	print_id?: string;
	print_language?: string | null;
	rarity?: string | null;
	layout?: string | null;
	is_default?: boolean;
	faces?: CardVaultFace[];
	product?: CardVaultProduct;
	print_set?: CardVaultPrintSet;
}

export interface CardVaultCore {
	pitch?: string | null;
	cost?: string | null;
	power?: string | null;
	defense?: string | null;
}

export interface CardVaultCardRecord {
	card_id?: string;
	cores?: CardVaultCore[];
	card_prints?: CardVaultCardPrint[];
}

export interface CardVaultProductGroupProduct {
	id?: string;
	product_name?: string | null;
	slug?: string | null;
	printed_language?: string | null;
	printed_date?: string | null;
	product_type?: string | null;
	release_date?: string | null;
	description?: string | null;
}

export interface CardVaultProductGroup {
	id?: string;
	group_name?: string | null;
	product_type?: string | null;
	release_date?: string | null;
	products?: CardVaultProductGroupProduct[];
}

export interface CardVaultListResponse<T> {
	count: number;
	next: string | null;
	previous: string | null;
	results: T[];
}
