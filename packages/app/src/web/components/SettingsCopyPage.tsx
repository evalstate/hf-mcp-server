import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { useState } from 'react';

interface SettingsCopyPageProps {
  settingsUrl?: string;
  linkUrl?: string;
  linkText?: string;
}

export function SettingsCopyPage({ 
  settingsUrl = 'http://localhost:8080/api/settings', 
  linkUrl = 'https://github.com/evalstate/hf-mcp-server',
  linkText = 'View Documentation'
}: SettingsCopyPageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopySettings = async () => {
    try {
      const response = await fetch(settingsUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }
      const settings = await response.json();
      const settingsText = JSON.stringify(settings, null, 2);
      
      await navigator.clipboard.writeText(settingsText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (error) {
      console.error('Error copying settings:', error);
      alert('Failed to copy settings. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-[500px]">
        <CardHeader>
          <CardTitle>MCP Server Settings</CardTitle>
          <CardDescription>
            Copy your current MCP server configuration or visit the documentation for more information.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <button
            onClick={handleCopySettings}
            className="w-full py-4 px-6 text-lg font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {copied ? '✓ Copied!' : 'Copy Settings'}
          </button>
          
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-4 px-6 text-lg font-semibold rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 block text-center"
          >
            {linkText}
          </a>
        </CardContent>
      </Card>
    </div>
  );
}