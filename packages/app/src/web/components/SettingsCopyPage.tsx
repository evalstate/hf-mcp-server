import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Copy, Settings } from 'lucide-react';

export function SettingsCopyPage() {
  // Handler for copying MCP URL
  const handleCopyMcpUrl = async () => {
    const mcpUrl = `https://huggingface.co/mcp`;

    try {
      await navigator.clipboard.writeText(mcpUrl);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  // Handler for going to settings (switch to search tab)
  const handleGoToSettings = () => {
    window.open('https://huggingface.co/settings/mcp', '_blank');
  };

  return (
    <div className="min-h-screen p-8 bg-background">
      <div className="max-w-2xl mx-auto">
        {/* HF MCP Server Card */}
        <Card>
          <CardHeader>
            <CardTitle>🤗 HF MCP Server</CardTitle>
            <CardDescription>Connect with AI assistants through the Model Context Protocol</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* What's MCP Section */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">What's MCP?</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The Model Context Protocol (MCP) is an open standard that enables AI assistants to securely
                connect to external data sources and tools. This HF MCP Server provides access to Hugging Face's
                ecosystem of models, datasets, and Spaces, allowing AI assistants to search, analyze, and interact
                with ML resources directly.
              </p>
            </div>

            <Separator />

            {/* Action Buttons */}
            <div className="flex flex-col gap-4">
              <Button
                size="xl"
                onClick={handleCopyMcpUrl}
                className="w-full transition-all duration-200 active:bg-green-500 active:border-green-500"
              >
                <Copy className="mr-2 h-5 w-5" />
                Copy MCP URL
              </Button>
              <Button size="xl" variant="outline" onClick={handleGoToSettings} className="w-full">
                <Settings className="mr-2 h-5 w-5" />
                Go to Settings to pick your tools
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}