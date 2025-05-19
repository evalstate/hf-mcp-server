interface TransportInfo {
  transport: "stdio" | "sse" | "streamableHttp" | "unknown";
  port?: number;
  hfTokenMasked?: string;
  hfTokenSet?: boolean;
}

interface ConnectionFooterProps {
  isLoading: boolean;
  error: string | null;
  transportInfo: TransportInfo;
}

export function ConnectionFooter({ isLoading, error, transportInfo }: ConnectionFooterProps) {
  // Format the transport name for display
  const getTransportDisplayName = () => {
    switch (transportInfo.transport) {
      case "stdio":
        return "STDIO";
      case "sse":
        return "SSE";
      case "streamableHttp":
        return "Streamable HTTP";
      default:
        return "Unknown";
    }
  };
  
  // Get the endpoint path for the transport
  const getEndpointPath = () => {
    switch (transportInfo.transport) {
      case "sse":
        return "/sse";
      case "streamableHttp":
        return "/mcp";
      case "stdio":
        return "stdin/stdout";
      default:
        return "unknown";
    }
  };

  if (isLoading) {
    return <div className="text-center text-xs text-muted-foreground py-2">Loading connection information...</div>;
  }

  if (error) {
    return <div className="text-center text-xs text-destructive py-2">Error: {error}</div>;
  }

  return (
    <div className="fixed bottom-0 left-0 w-full bg-muted/50 border-t border-border py-2 px-4">
      <div className="max-w-[700px] mx-auto flex justify-between items-center text-xs">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Using</span>
          <span className="font-medium text-primary">{getTransportDisplayName()}</span>
          {transportInfo.port && (
              <span className="text-muted-foreground">
                on port <span className="font-mono">{transportInfo.port}</span>
                {transportInfo.transport !== "stdio" && (
                  <span> at <span className="font-mono">{getEndpointPath()}</span></span>
                )}
              </span>
            )
          }
        </div>
        
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">HF Token:</span>
          <span className={`font-mono ${!transportInfo.hfTokenSet ? "text-red-500" : ""}`}>
            {transportInfo.hfTokenSet ? transportInfo.hfTokenMasked : "⚠️ Not configured"}
          </span>
        </div>
      </div>
    </div>
  );
}