// Common interfaces for model search and detail
export interface TransformersInfo {
	auto_model?: string;
	pipeline_tag?: string;
	processor?: string;
}

export interface SafeTensorsInfo {
	parameters?: Record<string, number>;
	total?: number;
}

// Utility functions for formatting
export function formatDate(dateString: string): string {
	try {
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return 'Unknown';

		const day = date.getDate();
		const month = date.toLocaleString('en', { month: 'short' });
		const year = date.getFullYear();

		return `${day} ${month}, ${year}`;
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
	return `${bytes} bytes`;
}
