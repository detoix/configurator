import { useState, useMemo } from "react";
import { Config } from "./Home";

type PricingMatrixProps = {
  isOpen: boolean;
  onClose: () => void;
  chapters: Config["chapters"];
  pricingRules: Record<string, Record<string, number>>;
  onUpdatePrice: (targetOptionId: string, dependencyOptionId: string, price: number | undefined) => void;
};

export function PricingMatrix({
  isOpen,
  onClose,
  chapters,
  pricingRules,
  onUpdatePrice,
}: PricingMatrixProps) {
  const [activeChapterId, setActiveChapterId] = useState<string>(() => chapters[0]?.id ?? "");

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === activeChapterId) ?? chapters[0],
    [chapters, activeChapterId]
  );

  // Flatten all options to build the matrix rows/cols
  const allOptions = useMemo(() => {
    const options: Array<{
      id: string;
      label: string;
      groupTitle: string;
      chapterTitle: string;
      chapterId: string;
    }> = [];
    chapters.forEach((chapter) => {
      chapter.groups.forEach((group) => {
        group.options.forEach((option) => {
          options.push({
            id: option.value,
            label: option.label,
            groupTitle: group.title,
            chapterTitle: chapter.title,
            chapterId: chapter.id,
          });
        });
      });
    });
    return options;
  }, [chapters]);

  // Filter options for the active chapter (rows)
  const activeChapterOptions = useMemo(
    () => allOptions.filter((opt) => opt.chapterId === activeChapterId),
    [allOptions, activeChapterId]
  );

  if (!isOpen) return null;

  return (
    <div className={`flex flex-col border-t border-white/10 bg-slate-950/95 backdrop-blur shadow-2xl transition-all ${isOpen ? "flex-1 min-h-0" : "h-0 overflow-hidden border-none"}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 shrink-0">
        <h2 className="text-sm font-semibold text-white">Pricing Matrix</h2>
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
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-950 shadow-sm">
            <tr>
              <th className="border-b border-white/10 bg-slate-950 px-3 py-2 font-medium text-white/50 sticky left-0 z-20">
                Target Option (Row)
              </th>
              {allOptions.map((colOpt) => (
                <th
                  key={colOpt.id}
                  className="min-w-[100px] border-b border-white/10 bg-slate-950 px-3 py-2 font-medium text-white"
                >
                  <div className="flex flex-col">
                    <span className="text-[9px] uppercase tracking-wider text-white/40">
                      {colOpt.chapterTitle} - {colOpt.groupTitle}
                    </span>
                    <span className="truncate max-w-[100px]" title={colOpt.label}>
                      {colOpt.label}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {activeChapterOptions.map((rowOpt) => (
              <tr key={rowOpt.id} className="hover:bg-white/5">
                <td className="sticky left-0 bg-slate-950/90 px-3 py-2 font-medium text-white border-r border-white/10">
                  <div className="flex flex-col">
                    <span className="text-[9px] uppercase tracking-wider text-white/40">
                      {rowOpt.groupTitle}
                    </span>
                    <span>{rowOpt.label}</span>
                  </div>
                </td>
                {allOptions.map((colOpt) => {
                  const isDiagonal = rowOpt.id === colOpt.id;
                  // Allow editing if it's diagonal (base price) OR if column option comes BEFORE row option (lower-left triangle)
                  // We can determine "before" by index in allOptions
                  const rowIndex = allOptions.findIndex((o) => o.id === rowOpt.id);
                  const colIndex = allOptions.findIndex((o) => o.id === colOpt.id);
                  const isLowerLeft = colIndex < rowIndex;
                  const isEditable = isDiagonal || isLowerLeft;

                  const price = pricingRules[rowOpt.id]?.[colOpt.id];
                  const displayValue = price !== undefined ? price : "";

                  return (
                    <td
                      key={colOpt.id}
                      className={`px-2 py-1 text-center border-r border-white/5 ${
                        isDiagonal ? "bg-teal-400/5" : ""
                      } ${!isEditable ? "bg-white/5 opacity-30 cursor-not-allowed" : ""}`}
                    >
                      <input
                        type="number"
                        disabled={!isEditable}
                        value={displayValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          onUpdatePrice(
                            rowOpt.id,
                            colOpt.id,
                            val === "" ? undefined : parseFloat(val)
                          );
                        }}
                        placeholder={isDiagonal ? "Base" : "-"}
                        className={`w-full bg-transparent text-center text-xs focus:outline-none focus:ring-1 focus:ring-teal-400 rounded py-1 ${
                          isDiagonal ? "font-bold text-teal-200" : "text-white/80"
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
