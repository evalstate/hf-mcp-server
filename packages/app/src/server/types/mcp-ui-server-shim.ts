// Ambient module shim for @mcp-ui/server under NodeNext resolution
// The upstream package's d.ts re-export fails to resolve with NodeNext.
// This keeps our build unblocked until the package fixes its types.
declare module '@mcp-ui/server' {
	export interface HTMLTextContent {
		uri: string;
		mimeType: string;
		text: string;
	}

	export interface Base64BlobContent {
		uri: string;
		mimeType: string;
		blob: string; // base64-encoded
	}

	export interface UIResource {
		type: 'resource';
		resource: HTMLTextContent | Base64BlobContent;
	}

	export interface CreateUIResourceOptions {
		uri: string; // must start with 'ui://'
		encoding: 'text' | 'blob';
		content:
			| { type: 'rawHtml'; htmlString: string }
			| { type: 'externalUrl'; iframeUrl: string }
			| { type: 'remoteDom'; script: string; framework?: string };
	}

	export function createUIResource(options: CreateUIResourceOptions): UIResource;
}

