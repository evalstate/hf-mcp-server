interface TransportInfo {
  transport: "stdio" | "sse" | "streamableHttp" | "streamableHttpJson" | "unknown";
  port?: number;
  hfTokenMasked?: string;
  hfTokenSet?: boolean;
  jsonResponseEnabled?: boolean;
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
      case "streamableHttpJson":
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
      case "streamableHttpJson":
        return "/mcp";
      case "stdio":
        return "stdin/stdout";
      default:
        return "unknown";
    }
  };

  // Check if using JSON mode
  const isJsonMode = () => {
    return transportInfo.transport === "streamableHttpJson" || 
           (transportInfo.transport === "streamableHttp" && transportInfo.jsonResponseEnabled === true);
  };

  // Get mode badge based on transport type
  const getModeBadge = () => {
    if (isJsonMode()) {
      // For JSON mode - green badge with "JSON (stateless)"
      return (
        <span className="ml-1.5 px-1.5 py-0.5 bg-green-100 text-green-800 text-[10px] rounded-sm whitespace-nowrap">
          JSON (stateless)
        </span>
      );
    } else if (transportInfo.transport === "streamableHttp") {
      // For non-JSON StreamableHttp - blue badge with "Session Based"
      return (
        <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] rounded-sm whitespace-nowrap">
          Session Based
        </span>
      );
    } else if (transportInfo.transport === "sse") {
      // For SSE - purple badge
      return (
        <span className="ml-1.5 px-1.5 py-0.5 bg-purple-100 text-purple-800 text-[10px] rounded-sm whitespace-nowrap">
          Event Stream
        </span>
      );
    }
    
    return null;
  };

  if (isLoading) {
    return <div className="text-center text-xs text-muted-foreground py-2">Loading connection information...</div>;
  }

  if (error) {
    return <div className="text-center text-xs text-destructive py-2">Error: {error}</div>;
  }
  
  // Ensure we always have port info for HTTP transports
  const shouldShowPort = transportInfo.transport !== "stdio";
  const port = transportInfo.port || (shouldShowPort ? 3000 : undefined);

  return (
    <div className="fixed bottom-0 left-0 w-full bg-muted/50 border-t border-border py-2 px-4">
      <div className="max-w-[700px] mx-auto flex justify-between items-center text-xs">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Using</span>
          <span className="font-medium text-primary">{getTransportDisplayName()}</span>
          
          {transportInfo.transport === "stdio" && (
            <span className="text-muted-foreground flex items-center">
              using <span className="font-mono mx-1">{getEndpointPath()}</span>
            </span>
          )}
          
          {shouldShowPort && (
            <span className="text-muted-foreground flex items-center">
              on port <span className="font-mono mx-1">{port}</span>
              at <span className="font-mono mx-1">{getEndpointPath()}</span>
              {getModeBadge()}
            </span>
          )}
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