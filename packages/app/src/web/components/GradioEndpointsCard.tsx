import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Label } from './ui/label';

export interface GradioEndpoint {
	url: string;
	enabled?: boolean;
}

interface GradioEndpointsCardProps {
	endpoints: GradioEndpoint[];
	onEndpointToggle: (index: number, enabled: boolean) => void;
	onEndpointUrlChange: (index: number, url: string) => void;
}

export function GradioEndpointsCard({ endpoints, onEndpointToggle, onEndpointUrlChange }: GradioEndpointsCardProps) {
	// Always show 3 endpoints
	const endpointRows = [0, 1, 2];

	return (
		<Card className="w-[700px]">
			<CardHeader>
				<CardTitle>🚀🧪 Experimental: Gradio Remote Tools (MCP)</CardTitle>
				<CardDescription>
					Configure up to 3 Gradio space endpoints for remote tool access. This setting is Global and applies to all
					Users. <span className="font-semibold">Note: Changes may require reconnecting your MCP client.</span>
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					{endpointRows.map((index) => {
						const endpoint = endpoints[index] || { url: '', enabled: true };
						return (
							<div key={index} className="flex items-center space-x-3">
								<Checkbox
									id={`gradio-endpoint-${index}`}
									checked={endpoint.enabled !== false}
									onCheckedChange={(checked) => onEndpointToggle(index, checked === true)}
								/>
								<Label htmlFor={`gradio-endpoint-${index}`} className="text-sm font-medium min-w-[60px]">
									Endpoint {index + 1}
								</Label>
								<Input
									type="url"
									placeholder="https://your-space.hf.space/gradio_api/mcp/sse"
									value={endpoint.url}
									onChange={(e) => onEndpointUrlChange(index, e.target.value)}
									className="flex-1 text-sm"
									disabled={endpoint.enabled === false}
								/>
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
