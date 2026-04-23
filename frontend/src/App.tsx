import { BrowserRouter as Router, Routes, Route, useSearchParams } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { ProjectSelector } from "./components/ProjectSelector";
import { ChatPage } from "./components/ChatPage";
import { SettingsProvider } from "./contexts/SettingsContext";
import { isDevelopment } from "./utils/environment";

// Global ESC key handler: forward to parent window (Open ACE) for fullscreen exit (Issue #103)
// This must be at App level so it works regardless of which page (ChatPage/ProjectSelector) is shown
function GlobalEscHandler({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && window.parent !== window) {
        window.parent.postMessage({ type: "qwen-code-esc-pressed" }, "*");
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return <>{children}</>;
}

// Lazy load DemoPage only in development
const DemoPage = isDevelopment()
  ? lazy(() =>
      import("./components/DemoPage").then((module) => ({
        default: module.DemoPage,
      })),
    )
  : null;

// Wrapper component to redirect to ChatPage if sessionId is in URL params
function RootRedirect() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  
  // If sessionId is present, render ChatPage directly
  if (sessionId) {
    return <ChatPage />;
  }
  
  // Otherwise show project selector
  return <ProjectSelector />;
}

function App() {
  return (
    <SettingsProvider>
      <GlobalEscHandler>
        <Router>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/projects/*" element={<ChatPage />} />
            {DemoPage && (
              <Route
                path="/demo"
                element={
                  <Suspense fallback={<div>Loading demo...</div>}>
                    <DemoPage />
                  </Suspense>
                }
              />
            )}
          </Routes>
        </Router>
      </GlobalEscHandler>
    </SettingsProvider>
  );
}

export default App;
