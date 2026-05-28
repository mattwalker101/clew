import React, { useState, useEffect } from "react";
import { 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  Circle, 
  RefreshCw, 
  Loader2, 
  BookOpen, 
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Compass,
  AlertCircle
} from "lucide-react";
import type { RegistryEntry } from "./RegistryTable";

type Gate = {
  type: string;
  path?: string;
  pattern?: string;
  command?: string;
  description?: string;
  status: "pending" | "completed" | "failed";
  error?: string;
};

type ActiveSession = {
  active: boolean;
  sessionId?: string;
  skillId?: string;
  status?: string;
  createdAt?: string;
  currentStep?: {
    id: string;
    title: string;
    instruction: string;
    index: number;
    totalSteps: number;
    status: string;
    gates: Gate[];
  } | null;
};

export function RunbookStepper({ registryEntries }: { registryEntries: RegistryEntry[] }) {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [startingSkillId, setStartingSkillId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter skills that have runnable steps
  const runnableSkills = registryEntries.filter(entry => entry.hasSteps);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/run/status");
      if (!res.ok) throw new Error("Failed to fetch runbook session status");
      const data = await res.json();
      setSession(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function startRunbook(skillId: string) {
    setStartingSkillId(skillId);
    setError(null);
    try {
      const res = await fetch("/api/run/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId })
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to start runbook session");
      }
      const data = await res.json();
      setSession(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStartingSkillId(null);
    }
  }

  async function verifyStep() {
    if (verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/run/verify", {
        method: "POST"
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to verify current step");
      }
      
      // Verification succeeded or failed. We refresh the full status to update the UI
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  }

  useEffect(() => {
    fetchStatus();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 animate-fadeIn">
        <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
        <p className="text-gray-400 font-medium text-sm">Querying active sessions...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-4 flex gap-3 items-start animate-fadeIn">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold">Execution Error:</span> {error}
          </div>
        </div>
      )}

      {session?.active && session.currentStep ? (
        // Active Session View
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
          {/* Main Step Detail Panel */}
          <div className="lg:col-span-2 flex flex-col gap-6 bg-gray-900/40 border border-gray-800 rounded-xl p-8 relative overflow-hidden">
            {/* Background glowing gradient */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none"></div>

            {/* Header */}
            <div className="flex justify-between items-start border-b border-gray-800/60 pb-5">
              <div>
                <span className="text-xs uppercase font-mono tracking-widest text-blue-400">Active Runbook Session</span>
                <h3 className="text-2xl font-bold text-white mt-1 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-yellow-400" />
                  {registryEntries.find(e => e.skillId === session.skillId)?.name || session.skillId}
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-1">Session: {session.sessionId}</p>
              </div>
              <button 
                onClick={fetchStatus}
                className="p-2 bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 rounded-lg transition-colors border border-gray-700/50"
                title="Refresh Status"
              >
                <RefreshCw className={`h-4 w-4 ${verifying ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* Step progress details */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-sm font-semibold">
                <span className="text-gray-400">Step {session.currentStep.index + 1} of {session.currentStep.totalSteps}</span>
                <span className="text-blue-400">{Math.round(((session.currentStep.index) / session.currentStep.totalSteps) * 100)}% Complete</span>
              </div>
              {/* Progress Bar */}
              <div className="w-full bg-gray-950 rounded-full h-2 overflow-hidden border border-gray-800">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${((session.currentStep.index) / session.currentStep.totalSteps) * 100}%` }}
                ></div>
              </div>
            </div>

            {/* Step Details */}
            <div className="flex flex-col gap-4 bg-gray-950/40 border border-gray-800/40 rounded-xl p-6">
              <span className="text-xs font-mono text-gray-500">CURRENT TARGET</span>
              <h4 className="text-xl font-bold text-white">{session.currentStep.title}</h4>
              <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{session.currentStep.instruction}</p>
            </div>

            {/* Verification Gates */}
            <div className="flex flex-col gap-4">
              <h5 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-green-400" /> Verification Gates
              </h5>

              <div className="flex flex-col gap-3">
                {session.currentStep.gates.map((gate, idx) => {
                  const isCompleted = gate.status === "completed";
                  const isFailed = gate.status === "failed";
                  
                  return (
                    <div 
                      key={idx}
                      className={`flex flex-col border rounded-xl p-4 transition-all ${
                        isCompleted 
                          ? "bg-green-500/5 border-green-500/20 hover:border-green-500/30" 
                          : isFailed
                            ? "bg-red-500/5 border-red-500/20 hover:border-red-500/30"
                            : "bg-gray-950/30 border-gray-800 hover:border-gray-700"
                      }`}
                    >
                      <div className="flex items-start gap-3 justify-between">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {isCompleted ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : isFailed ? (
                              <AlertTriangle className="h-5 w-5 text-red-500" />
                            ) : (
                              <Circle className="h-5 w-5 text-gray-600 animate-pulse" />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-sm text-white">
                              {gate.description || `Gate ${idx + 1}`}
                            </div>
                            <div className="text-xs text-gray-400 font-mono mt-1 select-all bg-gray-950/60 border border-gray-800/40 px-2 py-1 rounded inline-block">
                              {gate.type === "file" && `File Exists: ${gate.path}`}
                              {gate.type === "grep" && `Regex Match [${gate.pattern}] in: ${gate.path}`}
                              {gate.type === "command" && `Command Exit 0: ${gate.command}`}
                            </div>
                          </div>
                        </div>

                        <span className={`text-xs px-2 py-0.5 rounded font-mono font-bold uppercase border ${
                          isCompleted
                            ? "bg-green-950/50 text-green-400 border-green-900/30"
                            : isFailed
                              ? "bg-red-950/50 text-red-400 border-red-900/30"
                              : "bg-gray-900 text-gray-500 border-gray-800"
                        }`}>
                          {gate.status}
                        </span>
                      </div>

                      {/* Display failure explanation if available */}
                      {isFailed && gate.error && (
                        <div className="text-xs text-red-400 mt-2 bg-red-950/20 border border-red-900/20 p-2.5 rounded-lg font-mono">
                          ↳ {gate.error}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions Footer */}
            <div className="flex flex-col sm:flex-row gap-4 border-t border-gray-800/60 pt-6 mt-4 justify-between items-center">
              <button 
                onClick={() => startRunbook(session.skillId!)}
                disabled={startingSkillId !== null || verifying}
                className="w-full sm:w-auto text-xs text-gray-500 hover:text-red-400 bg-transparent px-3 py-2 rounded-lg transition-all hover:bg-red-500/5 disabled:opacity-40"
              >
                Restart Session
              </button>

              <button
                onClick={verifyStep}
                disabled={verifying}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6 py-2.5 text-sm font-semibold transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0 flex items-center justify-center gap-2 cursor-pointer"
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running Gate Verifications...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    Verify Gate Checks
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Sidebar Step Index Guide */}
          <div className="flex flex-col gap-6 bg-gray-900/30 border border-gray-800 rounded-xl p-6 h-fit sticky top-24">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Runbook Overview</h4>
            
            <div className="flex flex-col gap-4">
              {/* List out steps */}
              {Array.from({ length: session.currentStep.totalSteps }).map((_, idx) => {
                const isCurrent = idx === session.currentStep!.index;
                const isPast = idx < session.currentStep!.index;
                
                return (
                  <div key={idx} className="flex gap-3 items-center">
                    <div className={`h-8 w-8 rounded-full border flex items-center justify-center font-bold text-sm transition-all ${
                      isCurrent
                        ? "bg-blue-600 text-white border-blue-500 ring-4 ring-blue-500/10"
                        : isPast
                          ? "bg-green-950/40 border-green-900/40 text-green-400"
                          : "bg-gray-950 border-gray-800 text-gray-500"
                    }`}>
                      {isPast ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-sm font-medium ${isCurrent ? "text-white font-bold" : "text-gray-400"}`}>
                        Step {idx + 1}
                      </span>
                      {isCurrent && (
                        <span className="text-xs text-blue-400 font-mono">In Progress</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        // No Active Session State
        <div className="flex flex-col gap-8 animate-fadeIn">
          {/* Completed / Empty State Banner */}
          {session?.status === "completed" ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-10 text-center relative overflow-hidden max-w-3xl mx-auto w-full">
              <div className="absolute top-0 right-0 w-48 h-48 bg-green-500/5 blur-3xl rounded-full pointer-events-none"></div>
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-5 animate-pulse" />
              <h3 className="text-2xl font-bold text-white mb-2">🏆 Runbook Completed Successfully!</h3>
              <p className="text-gray-400 text-sm max-w-md mx-auto leading-relaxed mb-6">
                All verification gates passed perfectly and the active runbook session has finished successfully.
              </p>
              <button 
                onClick={() => setSession(null)}
                className="bg-gray-800 hover:bg-gray-700 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-all border border-gray-700/60"
              >
                Dismiss Completion Banner
              </button>
            </div>
          ) : (
            <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-12 text-center max-w-2xl mx-auto w-full">
              <BookOpen className="h-14 w-14 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">No Active Runbook Session</h3>
              <p className="text-gray-400 text-sm max-w-md mx-auto leading-relaxed">
                Launch a runbook below to execute sequential, self-verifying step workflows locally.
              </p>
            </div>
          )}

          {/* List of Available Runbooks */}
          <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-6">
            <h4 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
              <Compass className="h-5 w-5 text-blue-400" /> Executable Runbook Library
            </h4>

            {runnableSkills.length === 0 ? (
              <div className="text-center py-10 text-gray-500 text-sm italic border border-dashed border-gray-800 rounded-lg">
                No composed skills in the registry currently declare runbook steps.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {runnableSkills.map((skill) => {
                  const isStarting = startingSkillId === skill.skillId;
                  
                  return (
                    <div 
                      key={skill.skillId}
                      className="bg-gray-950/60 border border-gray-800 rounded-xl p-6 flex flex-col justify-between hover:border-gray-700 transition-all hover:-translate-y-0.5 relative group overflow-hidden"
                    >
                      {/* Decorative corner element */}
                      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 blur-2xl rounded-full group-hover:bg-blue-500/10 transition-all pointer-events-none"></div>

                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 px-2 py-0.5 bg-blue-950/30 rounded border border-blue-900/30">
                            {skill.layer}
                          </span>
                          <span className="text-xs font-mono text-gray-500">v{skill.version}</span>
                        </div>
                        <h5 className="text-lg font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">
                          {skill.name || skill.skillId}
                        </h5>
                        <p className="text-xs text-gray-500 font-mono mb-4">{skill.skillId}</p>
                      </div>

                      <button
                        onClick={() => startRunbook(skill.skillId)}
                        disabled={startingSkillId !== null}
                        className="w-full bg-gray-900 hover:bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold transition-all border border-gray-800 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-4"
                      >
                        {isStarting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Initializing Session...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 fill-white" />
                            Launch Runbook
                            <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
