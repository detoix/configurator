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
  const [activeChapterId, setActiveChapterId] = useState<string>(() => chapters[0]?.id ?? "");
  
  const allMeshes = useMemo(() => flattenMeshNames(meshTree), [meshTree]);
  
  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === activeChapterId) ?? chapters[0],
    [chapters, activeChapterId]
  );

  if (!isOpen) return null;

  return (
    <div className={`flex flex-col border-t border-white/10 bg-slate-950/95 backdrop-blur shadow-2xl transition-all ${isOpen ? "flex-1 min-h-0" : "h-0 overflow-hidden border-none"}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 shrink-0">
        <h2 className="text-sm font-semibold text-white">Visibility Matrix</h2>
        <button
          onClick={onClose}
          className="rounded-sm border border-white/10 p-1 text-white/60 hover:bg-white/10 hover:text-white"
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

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 px-4 pt-2 overflow-x-auto">
        {chapters.map((chapter) => (
          <button
            key={chapter.id}
            onClick={() => setActiveChapterId(chapter.id)}
            className={`border-b-2 px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              activeChapter?.id === chapter.id
                ? "border-teal-400 text-teal-400"
                : "border-transparent text-white/60 hover:text-white"
            }`}
          >
            {chapter.title || "Untitled"}
          </button>
        ))}
      </div>

      {/* Matrix Content */}
      <div className="flex-1 overflow-auto bg-slate-900/50">
        {activeChapter && (
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-950 shadow-sm">
              <tr>
                <th className="border-b border-white/10 bg-slate-950 px-3 py-2 font-medium text-white/50">
                  Mesh Name
                </th>

                {activeChapter.groups.map((group) =>
                  group.options.map((option) => (
                    <th
                      key={option.value}
                      className="min-w-[100px] border-b border-white/10 bg-slate-950 px-3 py-2 font-medium text-white"
                    >
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-wider text-white/40">
                          {group.title}
                        </span>
                        <span className="truncate max-w-[100px]" title={option.label}>{option.label}</span>
                      </div>
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {allMeshes.map((meshName) => {
                const isChapterHidden = activeChapter.visibility?.[meshName] === false;
                
                return (
                  <tr key={meshName} className="hover:bg-white/5">
                    <td className="px-3 py-1 font-mono text-[10px] text-white/70">{meshName}</td>
                    


                    {/* Options Visibility */}
                    {activeChapter.groups.map((group) =>
                      group.options.map((option) => {
                        const isOptionHidden = option.visibility?.[meshName] === false;
                        return (
                          <td key={option.value} className="px-3 py-1 text-center">
                            <input
                              type="checkbox"
                              checked={!isOptionHidden}
                              onChange={(e) =>
                                onUpdateOptionVisibility(
                                  activeChapter.id,
                                  group.id,
                                  option.value,
                                  meshName,
                                  e.target.checked
                                )
                              }
                              className="h-3 w-3 rounded border-white/20 bg-white/10 accent-teal-400"
                              title={`Toggle visibility for ${meshName} in ${option.label}`}
                            />
                          </td>
                        );
                      })
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
