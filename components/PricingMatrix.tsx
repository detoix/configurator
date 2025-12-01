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
    <div className={`flex flex-col border-t border-[#999999] bg-[#e9e9e9]/95 backdrop-blur shadow-2xl transition-all ${isOpen ? "flex-1 min-h-0" : "h-0 overflow-hidden border-none"}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#999999] px-4 py-2 shrink-0 bg-[#e9e9e9]">
        <h2 className="text-sm font-semibold text-[#111111] uppercase tracking-[0.2em]">Pricing Matrix</h2>
        <button
          onClick={onClose}
          className="rounded-sm border border-[#999999] p-1 text-[#111111] hover:border-[#ff6a3a] hover:text-[#ff6a3a] transition-colors"
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
      <div className="flex gap-2 border-b border-[#999999] px-4 pt-2 overflow-x-auto bg-[#e9e9e9]">
        {chapters.map((chapter) => (
          <button
            key={chapter.id}
            onClick={() => setActiveChapterId(chapter.id)}
            className={`border-b-2 px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors whitespace-nowrap ${
              activeChapter?.id === chapter.id
                ? "border-[#ff6a3a] text-[#ff6a3a]"
                : "border-transparent text-[#111111]/60 hover:text-[#111111]"
            }`}
          >
            {chapter.title || "Untitled"}
          </button>
        ))}
      </div>

      {/* Matrix Content */}
      <div className="flex-1 overflow-auto bg-white/20">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#e9e9e9] shadow-sm">
            <tr>
              <th className="border-b border-[#999999] bg-[#e9e9e9] px-3 py-2 font-semibold text-[#111111]/50 uppercase tracking-wider sticky left-0 z-20">
                Target Option (Row)
              </th>
              {allOptions.map((colOpt) => (
                <th
                  key={colOpt.id}
                  className="min-w-[100px] border-b border-[#999999] bg-[#e9e9e9] px-3 py-2 font-medium text-[#111111]"
                >
                  <div className="flex flex-col">
                    <span className="text-[9px] uppercase tracking-wider text-[#111111]/40">
                      {colOpt.chapterTitle} - {colOpt.groupTitle}
                    </span>
                    <span className="truncate max-w-[100px] font-semibold uppercase tracking-wider" title={colOpt.label}>
                      {colOpt.label}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#999999]/20">
            {activeChapterOptions.map((rowOpt) => (
              <tr key={rowOpt.id} className="hover:bg-white/50 transition-colors">
                <td className="sticky left-0 bg-[#e9e9e9]/95 px-3 py-2 font-medium text-[#111111] border-r border-[#999999] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  <div className="flex flex-col">
                    <span className="text-[9px] uppercase tracking-wider text-[#111111]/40">
                      {rowOpt.groupTitle}
                    </span>
                    <span className="font-semibold uppercase tracking-wider">{rowOpt.label}</span>
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
                      className={`px-2 py-1 text-center border-r border-[#999999]/20 ${
                        isDiagonal ? "bg-[#ff6a3a]/10" : ""
                      } ${!isEditable ? "bg-[#999999]/10 opacity-30 cursor-not-allowed" : ""}`}
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
                        className={`w-full bg-transparent text-center text-xs focus:outline-none focus:ring-1 focus:ring-[#ff6a3a] rounded-sm py-1 placeholder-[#111111]/20 ${
                          isDiagonal ? "font-bold text-[#ff6a3a]" : "text-[#111111]"
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
