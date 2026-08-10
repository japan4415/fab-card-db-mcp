import pino from "pino";

// ロガー設定
export const logger = pino({
	level: "info",
	browser: {
		asObject: true,
	},
	timestamp: pino.stdTimeFunctions.isoTime,
});
