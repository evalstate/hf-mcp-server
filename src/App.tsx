//import "./App.css";
import { Checkbox } from "./components/ui/checkbox";
import { Card, CardContent } from "./components/ui/card";

function App() {
  return (
    <>
      <div className="flex h-screen w-screen items-center justify-center">
        <Card className="w-[700px]">
          <CardContent>
            <div className="items-top flex space-x-2">
              <Checkbox id="space_semantic_search" />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="space_semantic_search"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Space Search
                </label>
                <p className="text-sm text-muted-foreground">
                  Use semantic search to find Hugging Face Spaces.
                </p>
              </div>
              <Checkbox id="paper_semantic_search" />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="paper_semantic_search"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Paper Search
                </label>
                <p className="text-sm text-muted-foreground">
                  Use semantic search to find papers from xyz.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default App;
