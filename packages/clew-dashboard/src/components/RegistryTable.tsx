import React, { useState, useMemo } from "react";
import { Search, Filter, Layers, BookOpen, Settings, CheckCircle2, XCircle, Star, Eye, EyeOff } from "lucide-react";

export type RegistryEntry = {
  skillId: string;
  layer: string;
  version: string;
  name: string;
  disabled: boolean;
  favorite: boolean;
  tags: string[];
  capabilities: {
    required?: string[];
    optional?: string[];
  };
  hasSteps?: boolean;
};

export function RegistryTable({ entries, onSelectSkill, onToggleFavorite, onToggleDisable }: { 
  entries: RegistryEntry[];
  onSelectSkill: (skillId: string) => void;
  onToggleFavorite: (skillId: string, favorite: boolean) => void;
  onToggleDisable: (skillId: string, disabled: boolean) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLayer, setSelectedLayer] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  const selectedSkill = useMemo(() => {
    return entries.find(e => e.skillId === selectedSkillId) || null;
  }, [entries, selectedSkillId]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      const matchSearch = 
        e.skillId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.tags || []).some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchLayer = selectedLayer === "all" || e.layer === selectedLayer;
      const matchStatus = 
        selectedStatus === "all" || 
        (selectedStatus === "active" && !e.disabled) || 
        (selectedStatus === "disabled" && e.disabled);

      return matchSearch && matchLayer && matchStatus;
    });
  }, [entries, searchTerm, selectedLayer, selectedStatus]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Registry list */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        {/* Controls */}
        <div className="flex flex-col md:flex-row gap-4 bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-500" />
            <input
              type="text"
              placeholder="Search skills by ID, name, or tag..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>

          <div className="flex gap-3">
            <div className="relative">
              <Layers className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <select
                value={selectedLayer}
                onChange={(e) => setSelectedLayer(e.target.value)}
                className="bg-gray-950 border border-gray-800 rounded-lg pl-9 pr-8 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
              >
                <option value="all">All Layers</option>
                <option value="system">System</option>
                <option value="project">Project</option>
                <option value="user">User</option>
              </select>
            </div>

            <div className="relative">
              <Settings className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-gray-950 border border-gray-800 rounded-lg pl-9 pr-8 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-xs font-semibold uppercase tracking-wider text-gray-400 bg-gray-950/50">
                  <th className="py-4 px-6">Skill</th>
                  <th className="py-4 px-6">Layer</th>
                  <th className="py-4 px-6">Version</th>
                  <th className="py-4 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-sm">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-gray-500">
                      No skills found matching filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((e) => (
                    <tr 
                      key={e.skillId}
                      onClick={() => setSelectedSkillId(e.skillId)}
                      className={`hover:bg-gray-800/30 transition-colors cursor-pointer ${
                        selectedSkillId === e.skillId ? "bg-blue-500/5 border-l-2 border-l-blue-500" : ""
                      }`}
                    >
                      <td className="py-4 px-6">
                        <div className="font-semibold text-white">{e.name || e.skillId}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{e.skillId}</div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                          e.layer === "system" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                          e.layer === "project" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                          "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        }`}>
                          {e.layer}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-gray-400 font-mono text-xs">{e.version}</td>
                      <td className="py-4 px-6">
                        {e.disabled ? (
                          <span className="inline-flex items-center gap-1 text-gray-500 text-xs">
                            <XCircle className="h-4 w-4 text-gray-600" /> Disabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-green-400 text-xs">
                            <CheckCircle2 className="h-4 w-4 text-green-500" /> Active
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-6 h-fit sticky top-24">
        {selectedSkill ? (
          <div className="flex flex-col gap-6">
            <div>
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs uppercase font-mono tracking-widest text-blue-400">{selectedSkill.layer} Skill</span>
                <span className="text-xs font-mono text-gray-500">v{selectedSkill.version}</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-1">{selectedSkill.name || selectedSkill.skillId}</h3>
              <p className="text-xs text-gray-500 font-mono">{selectedSkill.skillId}</p>
            </div>

            <div className="border-t border-gray-800 my-1"></div>

            <div>
              <h4 className="text-xs uppercase font-semibold text-gray-400 tracking-wider mb-2">Tags</h4>
              <div className="flex flex-wrap gap-1.5">
                {(!selectedSkill.tags || selectedSkill.tags.length === 0) ? (
                  <span className="text-sm text-gray-500 italic">No tags specified</span>
                ) : (
                  selectedSkill.tags.map(t => (
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
                {(!selectedSkill.capabilities?.required || selectedSkill.capabilities.required.length === 0) ? (
                  <span className="text-sm text-gray-500 italic">None</span>
                ) : (
                  selectedSkill.capabilities.required.map(c => (
                    <span key={c} className="px-2 py-0.5 bg-red-950/40 text-red-300 rounded text-xs border border-red-900/30">
                      {c}
                    </span>
                  ))
                )}
              </div>

              <h4 className="text-xs uppercase font-semibold text-gray-400 tracking-wider mb-2">Optional Capabilities</h4>
              <div className="flex flex-wrap gap-1.5">
                {(!selectedSkill.capabilities?.optional || selectedSkill.capabilities.optional.length === 0) ? (
                  <span className="text-sm text-gray-500 italic">None</span>
                ) : (
                  selectedSkill.capabilities.optional.map(c => (
                    <span key={c} className="px-2 py-0.5 bg-blue-950/40 text-blue-300 rounded text-xs border border-blue-900/30">
                      {c}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-2">
              <button
                onClick={() => onToggleFavorite(selectedSkill.skillId, !selectedSkill.favorite)}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold border transition-all ${
                  selectedSkill.favorite
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                    : "bg-gray-950 text-gray-400 border-gray-800 hover:text-white hover:border-gray-700"
                }`}
              >
                <Star className={`h-4 w-4 ${selectedSkill.favorite ? "fill-amber-400 text-amber-400" : ""}`} />
                {selectedSkill.favorite ? "Favorited" : "Favorite"}
              </button>

              <button
                onClick={() => onToggleDisable(selectedSkill.skillId, !selectedSkill.disabled)}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold border transition-all ${
                  selectedSkill.disabled
                    ? "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20"
                    : "bg-gray-950 text-gray-400 border-gray-800 hover:text-white hover:border-gray-700"
                }`}
              >
                {selectedSkill.disabled ? (
                  <>
                    <Eye className="h-4 w-4 text-green-400" /> Enable
                  </>
                ) : (
                  <>
                    <EyeOff className="h-4 w-4" /> Disable
                  </>
                )}
              </button>
            </div>

            <button
              onClick={() => onSelectSkill(selectedSkill.skillId)}
              className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-semibold transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 hover:-translate-y-0.5 flex items-center justify-center gap-2"
            >
              <BookOpen className="h-4 w-4" /> Trace Activation
            </button>
          </div>
        ) : (
          <div className="py-24 text-center">
            <BookOpen className="h-12 w-12 text-gray-600 mx-auto mb-4" />
            <h4 className="text-white font-medium mb-1">No Skill Selected</h4>
            <p className="text-sm text-gray-500 max-w-[200px] mx-auto">
              Select a skill from the list to view its properties and capabilities.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
