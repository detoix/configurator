import { useState, useMemo } from "react";
import { Config, ConfiguratorGroup, RadioOption } from "./Home";

type VisibilityMatrixProps = {
  isOpen: boolean;
  onClose: () => void;
  chapters: Config["chapters"];
  meshTree: MeshTreeNode[];
  onUpdateOptionVisibility: (
    chapterId: string,
    groupId: string,
    optionValue: string,
    meshName: string,
    visible: boolean
  ) => void;
};

export type MeshTreeNode = {
  name: string;
  children: MeshTreeNode[];
  isMesh: boolean;
};

function flattenMeshNames(nodes: MeshTreeNode[]): string[] {
  const names: string[] = [];
  nodes.forEach((node) => {
    if (node.isMesh) {
      names.push(node.name);
    }
    if (node.children.length > 0) {
      names.push(...flattenMeshNames(node.children));
    }
  });
  return Array.from(new Set(names)).sort();
}

export function VisibilityMatrix({
  isOpen,
  onClose,
  chapters,
  meshTree,
  onUpdateOptionVisibility,
}: VisibilityMatrixProps) {
  const [selectedMesh, setSelectedMesh] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showOverridesOnly, setShowOverridesOnly] = useState(false);

  const allMeshes = useMemo(() => flattenMeshNames(meshTree), [meshTree]);

  // Auto-select the first mesh if nothing is selected
  useMemo(() => {
    if (!selectedMesh && allMeshes.length > 0) {
      setSelectedMesh(allMeshes[0]);
    }
  }, [allMeshes, selectedMesh]);

  if (!isOpen) return null;

  // Helper to check if a mesh has any overrides in any option
  const hasOverrides = (meshName: string) => {
    return chapters.some(chapter => 
      chapter.groups.some(group => 
        group.options.some(option => 
          option.visibility?.[meshName] === false
        )
      )
    );
  };

  const filteredMeshes = allMeshes.filter((meshName) => {
    if (searchQuery && !meshName.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (showOverridesOnly && !hasOverrides(meshName)) {
      return false;
    }
    return true;
  });

  const handleResetMesh = () => {
    if (!selectedMesh) return;
    
    // Iterate through all options and reset visibility for this mesh
    chapters.forEach(chapter => {
      chapter.groups.forEach(group => {
        group.options.forEach(option => {
          if (option.visibility?.[selectedMesh] === false) {
            onUpdateOptionVisibility(
              chapter.id,
              group.id,
              option.value,
              selectedMesh,
              true // Set to visible (default)
            );
          }
        });
      });
    });
  };

  const handleHideInAll = () => {
    if (!selectedMesh) return;
    
    chapters.forEach(chapter => {
      chapter.groups.forEach(group => {
        group.options.forEach(option => {
          // Only update if not already hidden
          if (option.visibility?.[selectedMesh] !== false) {
            onUpdateOptionVisibility(
              chapter.id,
              group.id,
              option.value,
              selectedMesh,
              false // Set to hidden
            );
          }
        });
      });
    });
  };
  
  const handleShowInAll = () => {
     if (!selectedMesh) return;
     handleResetMesh(); // Same as reset since default is visible
  };

  return (
    <div className={`flex flex-col border-t border-[#999999] bg-[#e9e9e9]/95 backdrop-blur shadow-2xl transition-all ${isOpen ? "flex-1 min-h-0" : "h-0 overflow-hidden border-none"}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#999999] px-4 py-3 shrink-0 bg-[#e9e9e9]">
        <h2 className="text-sm font-semibold text-[#111111] uppercase tracking-[0.2em]">Visibility Matrix</h2>
        <button
          onClick={onClose}
          className="rounded-sm border border-[#999999] p-1.5 text-[#111111] hover:border-[#ff6a3a] hover:text-[#ff6a3a] transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Mesh List */}
        <div className="w-80 flex-shrink-0 border-r border-[#999999] flex flex-col bg-white/30">
          {/* Search & Filter */}
          <div className="p-4 border-b border-[#999999] space-y-3 bg-[#e9e9e9]/50">
            <div className="relative">
              <input
                type="text"
                placeholder="Search meshes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-[#999999] rounded-sm px-3 py-1.5 text-sm text-[#111111] placeholder-[#111111]/40 focus:outline-none focus:border-[#ff6a3a] transition-colors"
              />
              <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#111111]/30 pointer-events-none"
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <label className="flex items-center gap-2 text-xs text-[#111111]/70 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showOverridesOnly}
                onChange={(e) => setShowOverridesOnly(e.target.checked)}
                className="rounded-sm border-[#999999] bg-white text-[#ff6a3a] focus:ring-[#ff6a3a]"
              />
              Show modified only
            </label>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-2">
             <div className="grid grid-cols-1 gap-0.5">
              {filteredMeshes.map((meshName) => {
                const isSelected = selectedMesh === meshName;
                const isModified = hasOverrides(meshName);
                
                return (
                  <button
                    key={meshName}
                    onClick={() => setSelectedMesh(meshName)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs font-mono rounded-sm transition-all ${
                      isSelected
                        ? "bg-[#ff6a3a]/10 text-[#111111] border border-[#ff6a3a]"
                        : "text-[#111111]/70 border border-transparent hover:bg-white/50 hover:text-[#111111]"
                    }`}
                  >
                    <span className="truncate" title={meshName}>{meshName}</span>
                    {isModified && (
                      <span className="ml-2 w-1.5 h-1.5 rounded-full bg-[#ff6a3a] shrink-0" title="Has overrides" />
                    )}
                  </button>
                );
              })}
              {filteredMeshes.length === 0 && (
                <div className="text-center py-8 text-[#111111]/30 text-xs">
                  No meshes found.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Content: Options */}
        <div className="flex-1 flex flex-col bg-white/20 min-w-0">
          {selectedMesh ? (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between border-b border-[#999999] px-6 py-4 bg-[#e9e9e9]/50">
                <div>
                  <h3 className="text-sm font-bold text-[#111111] font-mono">{selectedMesh}</h3>
                  <p className="text-xs text-[#111111]/50 mt-0.5">Configure visibility across all options</p>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleHideInAll}
                    className="px-3 py-1.5 rounded-sm bg-white border border-[#999999] text-xs font-semibold uppercase tracking-wider text-[#111111] hover:border-[#ff6a3a] hover:text-[#ff6a3a] transition-colors"
                  >
                    Hide in All
                  </button>
                  <button
                    onClick={handleShowInAll}
                    className="px-3 py-1.5 rounded-sm bg-white border border-[#999999] text-xs font-semibold uppercase tracking-wider text-[#111111] hover:border-[#ff6a3a] hover:text-[#ff6a3a] transition-colors"
                  >
                    Show in All
                  </button>
                  <div className="w-px h-4 bg-[#999999]/30 mx-1" />
                  <button
                    onClick={handleResetMesh}
                    className="text-xs font-semibold uppercase tracking-wider text-[#111111]/50 hover:text-red-500 transition-colors px-2"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Options List */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-8 max-w-3xl mx-auto">
                  {chapters.map((chapter) => (
                    <div key={chapter.id} className="space-y-4">
                      <h4 className="text-xs font-bold text-[#111111]/40 uppercase tracking-[0.2em] border-b border-[#999999]/20 pb-2">
                        {chapter.title || "Untitled Chapter"}
                      </h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {chapter.groups.map((group) => (
                          <div key={group.id} className="bg-white/40 rounded-sm border border-[#999999] p-4 backdrop-blur-sm">
                            <h5 className="text-[10px] font-bold text-[#ff6a3a] uppercase tracking-[0.2em] mb-3">
                              {group.title}
                            </h5>
                            
                            <div className="space-y-1">
                              {group.options.map((option) => {
                                const isHidden = option.visibility?.[selectedMesh] === false;
                                
                                return (
                                  <label
                                    key={option.value}
                                    className={`flex items-center justify-between p-2 rounded-sm cursor-pointer transition-colors border ${
                                      isHidden 
                                        ? "bg-red-50 border-red-200" 
                                        : "border-transparent hover:bg-white/50"
                                    }`}
                                  >
                                    <div className="flex flex-col min-w-0 pr-3">
                                      <span className={`text-sm font-semibold uppercase tracking-wider truncate ${isHidden ? "text-red-800" : "text-[#111111]"}`}>
                                        {option.label}
                                      </span>
                                      <span className="text-[10px] text-[#111111]/50 truncate">
                                        {option.description}
                                      </span>
                                    </div>
                                    
                                    <div className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${isHidden ? "bg-[#999999]/30" : "bg-[#ff6a3a]"}`}>
                                      <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={!isHidden}
                                        onChange={(e) =>
                                          onUpdateOptionVisibility(
                                            chapter.id,
                                            group.id,
                                            option.value,
                                            selectedMesh,
                                            e.target.checked
                                          )
                                        }
                                      />
                                      <span
                                        className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform ${
                                          isHidden ? "translate-x-1" : "translate-x-5"
                                        }`}
                                      />
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[#111111]/30 text-sm uppercase tracking-widest">
              Select a mesh to configure visibility
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
