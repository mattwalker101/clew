import React from "react";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <nav className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
              <span className="text-blue-500">🧵</span> clew
            </div>
            <div className="flex items-center gap-6 text-sm font-medium text-gray-400">
              <a href="#" className="hover:text-white transition-colors">Registry</a>
              <a href="#" className="hover:text-white transition-colors">Activation</a>
              <a href="#" className="hover:text-white transition-colors">Interop</a>
              <a href="#" className="hover:text-white transition-colors">Settings</a>
            </div>
          </div>
        </div>
      </nav>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1 w-full">
        {children}
      </div>

      <footer className="border-t border-gray-800 bg-gray-900/50 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500 text-sm">
          clew v0.1.0 — Built with Superpowers
        </div>
      </footer>
    </div>
  );
}
