import React from "react";

export function Layout({ children, activeTab, onTabChange }: { 
  children: React.ReactNode; 
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <nav className="border-b border-gray-900 bg-gray-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2 font-bold text-xl tracking-tight cursor-pointer" onClick={() => onTabChange("overview")}>
              <span className="text-blue-500">🧵</span> clew Cockpit
            </div>
            <div className="flex items-center gap-6 text-sm font-medium">
              <button 
                onClick={() => onTabChange("overview")}
                className={`transition-colors cursor-pointer ${activeTab === "overview" ? "text-blue-400 font-semibold" : "text-gray-400 hover:text-white"}`}
              >
                Overview
              </button>
              <button 
                onClick={() => onTabChange("registry")}
                className={`transition-colors cursor-pointer ${activeTab === "registry" ? "text-blue-400 font-semibold" : "text-gray-400 hover:text-white"}`}
              >
                Registry
              </button>
              <button 
                onClick={() => onTabChange("runbook")}
                className={`transition-colors cursor-pointer ${activeTab === "runbook" ? "text-blue-400 font-semibold" : "text-gray-400 hover:text-white"}`}
              >
                Runbooks
              </button>
              <button 
                onClick={() => onTabChange("trace")}
                className={`transition-colors cursor-pointer ${activeTab === "trace" ? "text-blue-400 font-semibold" : "text-gray-400 hover:text-white"}`}
              >
                Activation Trace
              </button>
            </div>
          </div>
        </div>
      </nav>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1 w-full">
        {children}
      </div>

      <footer className="border-t border-gray-900 bg-gray-950 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500 text-sm">
          clew Cockpit v0.3.0 — Local Operational Registry Intelligence
        </div>
      </footer>
    </div>
  );
}
