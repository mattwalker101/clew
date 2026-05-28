import React, { useState, useEffect } from "react";
import { Layout } from "./layouts/Layout";
import { RegistryTable, type RegistryEntry } from "./components/RegistryTable";
import { TraceDebugger } from "./components/TraceDebugger";
import { HealthGauge } from "./components/HealthGauge";
import { KnowledgeMap } from "./components/KnowledgeMap";
import { RunbookStepper } from "./components/RunbookStepper";
import { 
  BookOpen, 
  Activity, 
  Settings, 
  AlertTriangle, 
  CheckCircle2, 
  Signal, 
  Compass, 
  RefreshCw,
  LayoutGrid,
  Network
} from "lucide-react";

type DoctorData = {
  skills: number;
  dbPath: string;
  repoSignals: string[];
  overlaps: number;
  conflicts: any[];
  registryWarnings: any[];
  agentsDiagnostics: any[];
  agentsPreferences: string[];
  warnings: Array<{ skillId?: string; type: string; message: string }>;
};

function App() {
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [loading, setLoading] = useState<boolean>(true);
  const [doctorData, setDoctorData] = useState<DoctorData | null>(null);
  const [registryEntries, setRegistryEntries] = useState<RegistryEntry[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string | undefined>(undefined);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [registryViewMode, setRegistryViewMode] = useState<"table" | "map">("table");
  const [selectedMapSkillId, setSelectedMapSkillId] = useState<string | undefined>(undefined);

  async function loadData() {
    setLoading(true);
    setFetchError(null);
    try {
      // 1. Fetch Doctor diagnostic metrics
      const docRes = await fetch("/api/doctor");
      if (!docRes.ok) throw new Error("Failed to load doctor diagnostics");
      const docJson = await docRes.json();
      setDoctorData(docJson);

      // 2. Fetch Registry entries
      const regRes = await fetch("/api/registry");
      if (!regRes.ok) throw new Error("Failed to load skill registry");
      const regJson = await regRes.json();
      setRegistryEntries(regJson.entries);
    } catch (err: any) {
      setFetchError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <Layout activeTab={activeTab} onTabChange={(tab) => {
      setActiveTab(tab);
      if (tab !== "trace") {
        // Clear quick selection
        setSelectedSkillId(undefined);
      }
    }}>
      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          <p className="text-gray-400 font-medium text-sm">Querying local API bridge...</p>
        </div>
      ) : fetchError ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-8 max-w-xl mx-auto text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Failed to Connect to local API</h3>
          <p className="text-gray-400 text-sm mb-6 leading-relaxed">
            Ensure the local `clew` server is running. You can start it from your terminal using:
            <code className="block bg-gray-950 px-3 py-2 rounded font-mono text-xs text-blue-400 mt-2">clew dashboard --port=7708</code>
          </p>
          <button 
            onClick={loadData}
            className="bg-gray-800 hover:bg-gray-700 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-all flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="h-4 w-4" /> Try Reconnecting
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {/* Tab Content: Overview */}
          {activeTab === "overview" && doctorData && (
            <div className="flex flex-col gap-10 animate-fadeIn">
              {/* Header */}
              <div className="flex justify-between items-start">
                <header className="flex flex-col gap-2">
                  <h1 className="text-4xl font-bold tracking-tight text-white">
                    🧵 clew Cockpit
                  </h1>
                  <p className="text-gray-400 text-lg">
                    Real-time local registry health, diagnostics, and telemetry analysis.
                  </p>
                </header>
                <button 
                  onClick={loadData}
                  className="bg-gray-900 border border-gray-800 hover:border-gray-700 text-gray-300 rounded-lg p-2.5 transition-colors cursor-pointer"
                  title="Refresh Diagnostics"
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <DashboardKpi
                  title="Composed Skills"
                  value={doctorData.skills}
                  description="Loaded in active registry index"
                  icon={<BookOpen className="h-6 w-6 text-blue-400" />}
                />
                <DashboardKpi
                  title="Overlaps Detected"
                  value={doctorData.overlaps}
                  description="Potential redundant skill scopes"
                  icon={<Settings className="h-6 w-6 text-purple-400" />}
                  alert={doctorData.overlaps > 0}
                />
                <DashboardKpi
                  title="Active Conflicts"
                  value={doctorData.conflicts.length}
                  description="Contradictory skill instructions"
                  icon={<AlertTriangle className="h-6 w-6 text-red-400" />}
                  alert={doctorData.conflicts.length > 0}
                />
                <DashboardKpi
                  title="Workspace Signals"
                  value={doctorData.repoSignals.length}
                  description="Project signals detected"
                  icon={<Signal className="h-6 w-6 text-green-400" />}
                />
              </div>

              {/* Warnings and preferences row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Warnings Feed */}
                <div className="lg:col-span-2 flex flex-col gap-4 bg-gray-900/40 border border-gray-800 rounded-xl p-6">
                  <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" /> Workspace Diagnostics
                  </h3>
                  
                  {doctorData.warnings.length === 0 ? (
                    <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-green-400 text-sm">
                      <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span>All systems operational! No capability, validation, or workspace warnings found.</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {doctorData.warnings.map((warn, index) => (
                        <div 
                          key={index}
                          className="flex gap-3 bg-amber-500/5 border border-amber-500/10 rounded-lg p-4 text-sm text-gray-300"
                        >
                          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div>
                            {warn.skillId && <span className="font-semibold text-white mr-1.5">{warn.skillId}:</span>}
                            <span className="text-gray-400">{warn.message}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Health & Rules Column */}
                <div className="flex flex-col gap-8">
                  {/* Health Gauge */}
                  <HealthGauge 
                    conflictsCount={doctorData.conflicts.length}
                    overlapsCount={doctorData.overlaps}
                    warningsCount={doctorData.warnings.length}
                  />

                  {/* Preferences */}
                  <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Compass className="h-5 w-5 text-blue-400" /> Workspace Rules
                    </h3>
                    <div className="flex flex-col gap-3">
                      {doctorData.agentsPreferences.length === 0 ? (
                        <span className="text-sm text-gray-500 italic">No rules parsed from AGENTS.md</span>
                      ) : (
                        doctorData.agentsPreferences.map((pref, idx) => (
                          <div key={idx} className="flex gap-2 text-sm text-gray-300">
                            <span className="text-blue-500">•</span>
                            <span>{pref}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: Registry */}
          {activeTab === "registry" && (
            <div className="animate-fadeIn">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
                <header className="flex flex-col gap-2">
                  <h1 className="text-4xl font-bold tracking-tight text-white">Composed Registry</h1>
                  <p className="text-gray-400 text-lg">
                    Explore and manage your local canonical skills, capabilities, and tags.
                  </p>
                </header>

                {/* View Mode Toggle */}
                <div className="flex bg-gray-900/60 p-1 border border-gray-800 rounded-lg text-sm font-medium">
                  <button
                    onClick={() => setRegistryViewMode("table")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors cursor-pointer ${
                      registryViewMode === "table" ? "bg-blue-600 text-white shadow-md shadow-blue-500/10" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <LayoutGrid className="h-4 w-4" /> List View
                  </button>
                  <button
                    onClick={() => setRegistryViewMode("map")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors cursor-pointer ${
                      registryViewMode === "map" ? "bg-blue-600 text-white shadow-md shadow-blue-500/10" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <Network className="h-4 w-4" /> Knowledge Map
                  </button>
                </div>
              </div>

              {registryViewMode === "table" ? (
                <RegistryTable 
                  entries={registryEntries} 
                  onSelectSkill={(id) => {
                    setSelectedSkillId(id);
                    setActiveTab("trace");
                  }}
                />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Knowledge Map takes 2/3 columns */}
                  <div className="lg:col-span-2 animate-fadeIn">
                    <KnowledgeMap
                      entries={registryEntries}
                      warnings={doctorData?.warnings || []}
                      selectedSkillId={selectedMapSkillId}
                      onSelectSkill={(id) => setSelectedMapSkillId(id)}
                    />
                  </div>

                  {/* Sidebar detail panel on the right 1/3 column */}
                  <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-6 h-fit sticky top-24 animate-fadeIn">
                    {(() => {
                      const selectedMapSkill = registryEntries.find(e => e.skillId === selectedMapSkillId);
                      return selectedMapSkill ? (
                        <div className="flex flex-col gap-6">
                          <div>
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-xs uppercase font-mono tracking-widest text-blue-400">{selectedMapSkill.layer} Skill</span>
                              <span className="text-xs font-mono text-gray-500">v{selectedMapSkill.version}</span>
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-1">{selectedMapSkill.name || selectedMapSkill.skillId}</h3>
                            <p className="text-xs text-gray-500 font-mono">{selectedMapSkill.skillId}</p>
                          </div>

                          <div className="border-t border-gray-800 my-1"></div>

                          <div>
                            <h4 className="text-xs uppercase font-semibold text-gray-400 tracking-wider mb-2">Tags</h4>
                            <div className="flex flex-wrap gap-1.5">
                              {(!selectedMapSkill.tags || selectedMapSkill.tags.length === 0) ? (
                                <span className="text-sm text-gray-500 italic">No tags specified</span>
                              ) : (
                                selectedMapSkill.tags.map(t => (
                                  <span key={t} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-300 border border-gray-700">
                                    {t}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>

                          <div>
                            <h4 className="text-xs uppercase font-semibold text-gray-400 tracking-wider mb-2">Required Capabilities</h4>
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {(!selectedMapSkill.capabilities?.required || selectedMapSkill.capabilities.required.length === 0) ? (
                                <span className="text-sm text-gray-500 italic">None</span>
                              ) : (
                                selectedMapSkill.capabilities.required.map(c => (
                                  <span key={c} className="px-2 py-0.5 bg-red-950/40 text-red-300 rounded text-xs border border-red-900/30">
                                    {c}
                                  </span>
                                ))
                              )}
                            </div>

                            <h4 className="text-xs uppercase font-semibold text-gray-400 tracking-wider mb-2">Optional Capabilities</h4>
                            <div className="flex flex-wrap gap-1.5">
                              {(!selectedMapSkill.capabilities?.optional || selectedMapSkill.capabilities.optional.length === 0) ? (
                                <span className="text-sm text-gray-500 italic">None</span>
                              ) : (
                                selectedMapSkill.capabilities.optional.map(c => (
                                  <span key={c} className="px-2 py-0.5 bg-blue-950/40 text-blue-300 rounded text-xs border border-blue-900/30">
                                    {c}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setSelectedSkillId(selectedMapSkill.skillId);
                              setActiveTab("trace");
                            }}
                            className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-semibold transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 hover:-translate-y-0.5 flex items-center justify-center gap-2"
                          >
                            <BookOpen className="h-4 w-4" /> Trace Activation
                          </button>
                        </div>
                      ) : (
                        <div className="py-24 text-center animate-fadeIn">
                          <BookOpen className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                          <h4 className="text-white font-medium mb-1">No Skill Selected</h4>
                          <p className="text-sm text-gray-500 max-w-[200px] mx-auto">
                            Click any node in the map to view its properties and capabilities.
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab Content: Runbooks */}
          {activeTab === "runbook" && (
            <div className="animate-fadeIn">
              <header className="flex flex-col gap-2 mb-8">
                <h1 className="text-4xl font-bold tracking-tight text-white">Interactive Runbook Stepper</h1>
                <p className="text-gray-400 text-lg">
                  Launch, track, and verify sequential operational steps for composed skills.
                </p>
              </header>
              <RunbookStepper registryEntries={registryEntries} />
            </div>
          )}

          {/* Tab Content: Trace Debugger */}
          {activeTab === "trace" && (
            <div className="animate-fadeIn">
              <header className="flex flex-col gap-2 mb-8">
                <h1 className="text-4xl font-bold tracking-tight text-white">Activation Intelligence</h1>
                <p className="text-gray-400 text-lg">
                  Inspect query recommendation tracing, suppressions, and overlay metrics.
                </p>
              </header>
              <TraceDebugger initialSkillId={selectedSkillId} />
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}

function DashboardKpi({ title, value, description, icon, alert }: {
  title: string;
  value: number;
  description: string;
  icon: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div className={`bg-gray-900/50 border rounded-xl p-6 transition-all hover:-translate-y-0.5 ${
      alert ? "border-amber-500/20 hover:border-amber-500/40 shadow-lg shadow-amber-950/5" : "border-gray-800 hover:border-gray-700"
    }`}>
      <div className="flex justify-between items-center mb-4">
        <span className="text-gray-400 text-sm font-semibold uppercase tracking-wider">{title}</span>
        {icon}
      </div>
      <div className="text-4xl font-extrabold text-white mb-2 tracking-tight">{value}</div>
      <div className="text-xs text-gray-500 leading-normal">{description}</div>
    </div>
  );
}

export default App;
