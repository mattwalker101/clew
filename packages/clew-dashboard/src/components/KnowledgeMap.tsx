import React, { useMemo } from "react";
interface RegistryEntry {
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
}

interface KnowledgeMapProps {
  entries: RegistryEntry[];
  warnings: Array<{ skillId?: string; type?: string; code?: string; message: string; field?: string }>;
  selectedSkillId: string | undefined;
  onSelectSkill: (skillId: string) => void;
}

export function KnowledgeMap({ entries, warnings, selectedSkillId, onSelectSkill }: KnowledgeMapProps) {
  // SVG Canvas Center and Radii
  const cx = 300;
  const cy = 300;
  const radii: Record<string, number> = {
    system: 60,
    project: 155,
    user: 240,
  };

  // 1. Position skill nodes deterministically based on concentric Layer
  const nodes = useMemo(() => {
    // Group skills by layer
    const groups: Record<string, RegistryEntry[]> = {
      system: [],
      project: [],
      user: [],
    };

    entries.forEach((e) => {
      const layerKey = e.layer?.toLowerCase() || "project";
      if (groups[layerKey]) {
        groups[layerKey].push(e);
      } else {
        groups.project.push(e);
      }
    });

    const positions: Record<string, { x: number; y: number; entry: RegistryEntry }> = {};

    // For each layer, space nodes evenly around the circle
    Object.keys(groups).forEach((layerKey) => {
      const list = groups[layerKey];
      const r = radii[layerKey];
      const count = list.length;
      
      list.forEach((entry, idx) => {
        // Space nodes evenly
        const angle = count > 1 ? (idx * 2 * Math.PI) / count - Math.PI / 2 : -Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        positions[entry.skillId] = { x, y, entry };
      });
    });

    return positions;
  }, [entries]);

  // 2. Parse relationship links from warnings array dynamically
  const links = useMemo(() => {
    const rawLinks: Array<{
      source: string;
      target: string;
      type: "inheritance" | "overlap" | "conflict";
      label?: string;
    }> = [];

    // Parse links from overlap/conflict warning fields ("skillA:skillB")
    (warnings || []).forEach((warn) => {
      if (warn.field && warn.field.includes(":")) {
        const [left, right] = warn.field.split(":");
        if (left && right && nodes[left] && nodes[right]) {
          const isConflict = 
            warn.message.toLowerCase().includes("conflict") || 
            warn.code?.toLowerCase().includes("conflict");
          const isRedundant = 
            warn.message.toLowerCase().includes("redundant");
          
          rawLinks.push({
            source: left,
            target: right,
            type: isConflict ? "conflict" : isRedundant ? "overlap" : "inheritance",
            label: isConflict ? "Conflict" : isRedundant ? "Redundancy" : "Overlap",
          });
        }
      }
    });

    // Deduplicate links in both directions
    const uniqueLinks: typeof rawLinks = [];
    const linkKeys = new Set<string>();

    rawLinks.forEach((l) => {
      const key = [l.source, l.target].sort().join("-") + `:${l.type}`;
      if (!linkKeys.has(key)) {
        linkKeys.add(key);
        uniqueLinks.push(l);
      }
    });

    return uniqueLinks;
  }, [warnings, nodes]);

  return (
    <div className="flex flex-col gap-4 bg-gray-900/40 border border-gray-800 rounded-xl p-6 relative select-none">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-bold text-white">Interactive Knowledge Map</h3>
        <div className="flex items-center gap-4 text-2xs font-mono text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500/20 border border-purple-500/80 inline-block"></span> System
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500/20 border border-blue-500/80 inline-block"></span> Project
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/80 inline-block"></span> User
          </span>
        </div>
      </div>

      <div className="relative border border-gray-950 bg-gray-950/40 rounded-xl overflow-hidden flex items-center justify-center">
        <svg className="w-full max-w-[500px] h-[500px]" viewBox="0 0 600 600">
          <defs>
            {/* Pulsating glow filters */}
            <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glow-amber" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Dotted Concentric Layer Circles */}
          <circle cx={cx} cy={cy} r={radii.system} className="stroke-purple-500/10 fill-none" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx={cx} cy={cy} r={radii.project} className="stroke-blue-500/10 fill-none" strokeWidth="1" strokeDasharray="4 4" />
          <circle cx={cx} cy={cy} r={radii.user} className="stroke-amber-500/10 fill-none" strokeWidth="1" strokeDasharray="5 5" />

          {/* Concentric Circle Axis Labels */}
          <text x={cx} y={cy - radii.system - 5} className="fill-purple-500/40 text-[9px] font-mono text-center" textAnchor="middle">System Layer</text>
          <text x={cx} y={cy - radii.project - 5} className="fill-blue-500/40 text-[9px] font-mono text-center" textAnchor="middle">Project Layer</text>
          <text x={cx} y={cy - radii.user - 5} className="fill-amber-500/40 text-[9px] font-mono text-center" textAnchor="middle">User Layer</text>

          {/* Relationship Connection Paths */}
          {links.map((link, idx) => {
            const p1 = nodes[link.source];
            const p2 = nodes[link.target];
            if (!p1 || !p2) return null;

            if (link.type === "conflict") {
              return (
                <line
                  key={idx}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  className="stroke-red-500/60 stroke-[3] animate-pulse"
                  filter="url(#glow-red)"
                />
              );
            } else if (link.type === "overlap") {
              return (
                <line
                  key={idx}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  className="stroke-amber-500/40 stroke-[2]"
                  strokeDasharray="4 4"
                  filter="url(#glow-amber)"
                />
              );
            } else {
              return (
                <line
                  key={idx}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  className="stroke-blue-500/20 stroke-[1.5]"
                />
              );
            }
          })}

          {/* Skill Nodes */}
          {Object.entries(nodes).map(([skillId, node]) => {
            const isSelected = selectedSkillId === skillId;
            let nodeColor = "fill-blue-500";
            let strokeColor = "stroke-blue-400";
            let glowFilter = "";

            if (node.entry.layer === "system") {
              nodeColor = "fill-purple-500";
              strokeColor = "stroke-purple-400";
            } else if (node.entry.layer === "user") {
              nodeColor = "fill-amber-500";
              strokeColor = "stroke-amber-400";
            }

            if (isSelected) {
              glowFilter = "url(#glow-blue)";
            }

            return (
              <g
                key={skillId}
                transform={`translate(${node.x}, ${node.y})`}
                className="cursor-pointer group"
                onClick={() => onSelectSkill(skillId)}
              >
                {/* Node Outer Glow Ring (when selected) */}
                {isSelected && (
                  <circle
                    r="14"
                    className={`${nodeColor}/20 stroke-[1.5] ${strokeColor}`}
                    filter={glowFilter}
                  />
                )}
                
                {/* Hover ring */}
                <circle
                  r="12"
                  className={`fill-none stroke-[2] stroke-transparent group-hover:stroke-white/30 transition-all duration-200`}
                />

                {/* Core Node Circle */}
                <circle
                  r="8"
                  className={`${nodeColor} stroke-[2] ${isSelected ? "stroke-white" : "stroke-gray-950"}`}
                />

                {/* Skill Name Label */}
                <text
                  y="20"
                  className={`text-[9px] font-mono tracking-tight text-center transition-all duration-200 fill-gray-400 group-hover:fill-white ${
                    isSelected ? "fill-white font-bold" : ""
                  }`}
                  textAnchor="middle"
                >
                  {node.entry.name || skillId}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="text-2xs font-mono text-gray-500 text-center">
        💡 Click on any skill node to inspect its manifest in the details panel. Red connections highlight active warning conflicts.
      </div>
    </div>
  );
}
