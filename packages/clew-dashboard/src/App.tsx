import React from "react";
import { Layout } from "./layouts/Layout";

function App() {
  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight text-white flex items-center gap-3">
            <span className="text-blue-500">🧵</span> clew Cockpit
          </h1>
          <p className="text-gray-400 text-lg">
            Portable operational knowledge for coding agents.
          </p>
        </header>

        <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <DashboardCard
            title="Skill Registry"
            description="Explore and manage your canonical operational knowledge bundles."
            status="Operational"
            icon="📚"
          />
          <DashboardCard
            title="Activation Intelligence"
            description="Inspect traces and signals driving current recommendations."
            status="Active"
            icon="🧠"
          />
          <DashboardCard
            title="Ecosystem Interop"
            description="Monitor Claude and OpenCode bridge health and round-trips."
            status="Connected"
            icon="🔌"
          />
        </main>
      </div>
    </Layout>
  );
}

function DashboardCard({ title, description, status, icon }: { 
  title: string; 
  description: string; 
  status: string;
  icon: string;
}) {
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 hover:border-blue-500/50 transition-colors group">
      <div className="flex justify-between items-start mb-4">
        <span className="text-3xl">{icon}</span>
        <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
          {status}
        </span>
      </div>
      <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-blue-400 transition-colors">
        {title}
      </h3>
      <p className="text-gray-400 leading-relaxed">
        {description}
      </p>
    </div>
  );
}

export default App;
