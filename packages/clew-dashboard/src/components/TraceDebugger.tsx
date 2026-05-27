import React, { useState, useEffect } from "react";
import { Terminal, Shield, Play, HelpCircle, Activity, ChevronRight, Sliders } from "lucide-react";

export type Signal = {
  type: string;
  value: string;
  score: number;
  weight: number;
};

export type Candidate = {
  skillId: string;
  name?: string;
  score: number;
  active: boolean;
  suppressed: boolean;
  suppressionReason?: string;
  signals: Signal[];
};

export type Recommendation = {
  skillId: string;
  name: string;
  score: number;
  signals: Signal[];
};

export function TraceDebugger({ initialSkillId }: { initialSkillId?: string }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [traceResult, setTraceResult] = useState<{
    candidates: Candidate[];
    recommendations: Recommendation[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Automatically trigger trace if initialSkillId is provided
  useEffect(() => {
    if (initialSkillId) {
      setQuery(initialSkillId);
      runTrace(initialSkillId);
    }
  }, [initialSkillId]);

  async function runTrace(searchQuery: string) {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("http://localhost:7708/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      if (!res.ok) throw new Error("Failed to compile activation trace");
      const data = await res.json();
      setTraceResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Input query panel */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Terminal className="h-5 w-5 text-blue-400" /> Explain Activation Signals
        </h3>
        <p className="text-gray-400 text-sm mb-6 max-w-2xl">
          Enter a prompt or query to run the live `ActivationEngine` and see exactly which skills are triggered, which are suppressed due to redundancies, and the raw mathematical signal trace weights.
        </p>

        <form 
          onSubmit={(e) => { e.preventDefault(); runTrace(query); }}
          className="flex gap-3"
        >
          <input
            type="text"
            placeholder="e.g. 'typescript helper', 'postgres performance optimization', 'git worktrees'..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-6 rounded-lg font-semibold text-sm transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 flex items-center gap-2"
          >
            {loading ? (
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
            Run Trace
          </button>
        </form>

        {error && (
          <div className="mt-4 text-xs font-semibold px-4 py-2 rounded bg-red-500/10 border border-red-500/20 text-red-400">
            Error: {error}
          </div>
        )}
      </div>

      {traceResult && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recommended active skills */}
          <div className="flex flex-col gap-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-gray-800 pb-3">
              <Shield className="h-5 w-5 text-green-400" /> Active Recommendations ({traceResult.recommendations.length})
            </h3>

            {traceResult.recommendations.length === 0 ? (
              <div className="bg-gray-900/20 border border-gray-800 border-dashed rounded-xl py-16 text-center text-gray-500 text-sm">
                No active skills met the recommendation threshold.
              </div>
            ) : (
              traceResult.recommendations.map((rec) => (
                <div 
                  key={rec.skillId}
                  className="bg-gray-900/50 border border-green-500/30 rounded-xl p-6 hover:border-green-500/50 transition-colors shadow-lg shadow-green-950/10"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="text-lg font-bold text-white">{rec.name || rec.skillId}</h4>
                      <span className="text-xs font-mono text-gray-500">{rec.skillId}</span>
                    </div>
                    <span className="px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded text-xs font-mono font-semibold">
                      Score: {rec.score.toFixed(1)}
                    </span>
                  </div>

                  <div className="border-t border-gray-800/80 my-3"></div>

                  <h5 className="text-xs uppercase font-semibold text-gray-400 tracking-wider mb-2 flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5 text-blue-400" /> Signal Breakdown
                  </h5>
                  <div className="flex flex-col gap-2 bg-gray-950/40 rounded-lg p-3">
                    {rec.signals.map((sig, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="text-gray-400 font-mono flex items-center gap-1">
                          <ChevronRight className="h-3 w-3 text-gray-500" /> {sig.type}: {sig.value}
                        </span>
                        <span className="font-mono text-gray-300">+{sig.score.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Suppressed / Inactive Candidates */}
          <div className="flex flex-col gap-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-gray-800 pb-3">
              <Activity className="h-5 w-5 text-gray-400" /> Candidate Pool & Suppressions
            </h3>

            {traceResult.candidates.filter(c => !c.active).length === 0 ? (
              <div className="bg-gray-900/20 border border-gray-800 border-dashed rounded-xl py-16 text-center text-gray-500 text-sm">
                No skills were suppressed or filtered out.
              </div>
            ) : (
              traceResult.candidates
                .filter(c => !c.active)
                .map((cand) => (
                  <div 
                    key={cand.skillId}
                    className="bg-gray-900/30 border border-gray-800 rounded-xl p-6 text-gray-400"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="text-base font-semibold text-gray-300">{cand.name || cand.skillId}</h4>
                        <span className="text-xs font-mono text-gray-600">{cand.skillId}</span>
                      </div>
                      <span className="px-2.5 py-0.5 bg-gray-800 text-gray-400 rounded text-xs font-mono">
                        Score: {cand.score.toFixed(1)}
                      </span>
                    </div>

                    {cand.suppressed && (
                      <div className="mt-2 text-xs font-semibold px-3 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-1.5">
                        <HelpCircle className="h-3.5 w-3.5" />
                        <span>Suppressed: {cand.suppressionReason || "Redundancy suppression"}</span>
                      </div>
                    )}

                    <div className="border-t border-gray-800/80 my-3"></div>

                    <div className="flex flex-col gap-1.5 bg-gray-950/20 rounded-lg p-2.5 text-xs text-gray-500 font-mono">
                      {cand.signals.map((sig, idx) => (
                        <div key={idx} className="flex justify-between items-center">
                          <span>{sig.type}: {sig.value}</span>
                          <span>+{sig.score.toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
