// Utility functions for formatting
export function formatDate(date: Date | string): string {
	try {
		const dateObj = date instanceof Date ? date : new Date(date);
		if (isNaN(dateObj.getTime())) return 'Unknown';

		const day = dateObj.getDate();
		const month = dateObj.toLocaleString('en', { month: 'short' });
		const year = dateObj.getFullYear();

		return `${day.toString()} ${month}, ${year.toString()}`;
	} catch {
		return 'Unknown';
	}
}

export function formatNumber(num: number): string {
	if (num >= 1000000) {
		return `${(num / 1000000).toFixed(1)}M`;
	} else if (num >= 1000) {
		return `${(num / 1000).toFixed(1)}K`;
	}
	return num.toString();
}

export function formatBytes(bytes: number): string {
	if (bytes >= 1000000000) {
		return `${(bytes / 1000000000).toFixed(1)} GB`;
	} else if (bytes >= 1000000) {
		return `${(bytes / 1000000).toFixed(1)} MB`;
	} else if (bytes >= 1000) {
		return `${(bytes / 1000).toFixed(1)} KB`;
	}
	return `${bytes.toString()} bytes`;
}

/**
 * Escapes special markdown characters in a string
 * @param text The text to escape
 * @returns The escaped text
 */
export function escapeMarkdown(text: string): string {
	if (!text) return '';
	// Replace pipe characters and newlines for table compatibility
	// Plus additional markdown formatting characters for better safety
	return text
		.replace(/\|/g, '\\|')
		.replace(/\n/g, ' ')
		.replace(/\*/g, '\\*')
		.replace(/_/g, '\\_')
		.replace(/~/g, '\\~')
		.replace(/`/g, '\\`')
		.replace(/>/g, '\\>')
		.replace(/#/g, '\\#');
}
