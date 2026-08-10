import { CARDVAULT_WEB_BASE } from "./cardvault/client";
import type { CardVaultCardPrint, CardVaultFace } from "./cardvault/types";
import type { CardDetail } from "./schemas";

export function asOptionalString(value: unknown): string | undefined {
	if (value === null || value === undefined) {
		return undefined;
	}

	const stringValue = String(value).trim();
	return stringValue.length > 0 ? stringValue : undefined;
}

export function asStringOrEmpty(value: unknown): string {
	return asOptionalString(value) ?? "";
}

export function formatLabel(value: string): string {
	return value
		.split(/[-_\s]+/)
		.filter((word) => word.length > 0)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

export function normalizeLanguageCode(code: string | null | undefined): string {
	return (asOptionalString(code) ?? "en").toUpperCase();
}

export function pickPrimaryFace(
	faces: CardVaultFace[] | undefined,
	preferredFaceId?: string,
): CardVaultFace | undefined {
	const resolvedFaces = faces ?? [];

	if (preferredFaceId) {
		const matchedFace = resolvedFaces.find(
			(face) => asOptionalString(face.face_id) === preferredFaceId,
		);
		if (matchedFace) {
			return matchedFace;
		}
	}

	if (resolvedFaces.length === 0) {
		return undefined;
	}

	const sortedFaces = [...resolvedFaces].sort((left, right) => {
		const leftPosition =
			typeof left.layout_position === "number"
				? left.layout_position
				: Number.MAX_SAFE_INTEGER;
		const rightPosition =
			typeof right.layout_position === "number"
				? right.layout_position
				: Number.MAX_SAFE_INTEGER;
		return leftPosition - rightPosition;
	});

	return sortedFaces[0];
}

export function findFaceByLanguage(
	cardPrints: CardVaultCardPrint[],
	languageCode: string,
): CardVaultFace | undefined {
	const normalizedLanguageCode = languageCode.toLowerCase();

	for (const cardPrint of cardPrints) {
		for (const face of cardPrint.faces ?? []) {
			const faceLanguage = (
				asOptionalString(face.face_language) ?? asOptionalString(cardPrint.print_language)
			)?.toLowerCase();
			if (faceLanguage === normalizedLanguageCode) {
				return face;
			}
		}
	}

	return undefined;
}

export function buildVariants(
	cardId: string,
	cardPrints: CardVaultCardPrint[],
): CardDetail["variants"] {
	type CardVariant = NonNullable<CardDetail["variants"]>[number];
	const variants = new Map<string, CardVariant>();

	for (const cardPrint of cardPrints) {
		const printId = asOptionalString(cardPrint.print_id);
		const faces = cardPrint.faces ?? [];
		for (const face of faces) {
			const variantPrintId = asOptionalString(face.face_id) ?? printId;
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
				url: `${CARDVAULT_WEB_BASE}/card/${encodeURIComponent(cardId)}/${encodeURIComponent(
					printId ?? variantPrintId,
				)}`,
			});
		}
	}

	return Array.from(variants.values());
}

export function parsePageNumberFromUrl(urlText: string | null): number | undefined {
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
