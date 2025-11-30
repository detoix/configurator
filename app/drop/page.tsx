'use client';

import { useCallback, useState } from "react";
import type { DragEvent } from "react";
import { useRouter } from "next/navigation";

const isGlbFile = (file: File) => {
  return (
    file.name.toLowerCase().endsWith(".glb") ||
    file.type === "model/gltf-binary" ||
    file.type === "model/glb"
  );
};

export default function DropPage() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      setError(null);
      const file = event.dataTransfer?.files?.[0];
      if (!file) {
        return;
      }
      if (!isGlbFile(file)) {
        setError("Only .glb files are supported.");
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      window.sessionStorage.setItem("droppedModelUrl", objectUrl);
      router.push("/");
    },
    [router]
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div
      className="min-h-screen bg-[#e9e9e9] text-white"
      style={{
        backgroundImage: "url('/shape-9.87b97093.webp')",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-16">
        <div className="space-y-4 text-lg leading-relaxed text-slate-700">
          <h1 className="text-4xl font-semibold text-[#111111] sm:text-5xl">Design starts with a drop</h1>
          <p className="text-base text-[#111111]/70">
            Drop a `.glb` file into the field below and we’ll immediately surface the configurator while preserving
            the exact palette and boundary treatments you rely on in the rest of the UI.
          </p>
        </div>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            className={`flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-sm border border-[#999999] bg-[#e9e9e9] px-8 py-8 text-center text-sm text-[#111111] transition ${
              isDragging ? "border-[#ff6a3a] bg-white text-[#111111]" : ""
            }`}
          >
            <p className="text-xl font-semibold text-[#111111]">
              {isDragging ? "Release to open designer" : "Drop your .glb file here"}
            </p>
            <p className="text-[11px] uppercase tracking-[0.4em] text-[#111111]/60">.glb only</p>
          </div>
          {error && <p className="mt-4 text-xs text-red-300">{error}</p>}
        </div>
    </div>
  );
}
