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
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 rounded-sm border border-white/10 bg-slate-900/80 p-6 text-center shadow-2xl backdrop-blur">
        <p className="text-xs uppercase tracking-[0.4em] text-teal-200">Drop GLB</p>
        <h1 className="text-3xl font-semibold">Design starts with a drop</h1>
        <p className="text-sm text-white/70">
          Drop your `.glb` file below to jump directly into the configurator. We will open the design
          experience as soon as the upload completes.
        </p>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          className={`flex min-h-[240px] flex-col items-center justify-center rounded-sm border-2 border-dashed px-6 py-10 text-sm transition ${
            isDragging
              ? "border-teal-400 bg-white/5 text-teal-200"
              : "border-white/30 bg-transparent text-white/60"
          }`}
        >
          <p className="text-lg font-semibold">
            {isDragging ? "Release to open designer" : "Drop your .glb file here"}
          </p>
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">only .glb supported</p>
        </div>
        {error && <p className="text-xs text-red-300">{error}</p>}
        <div className="text-xs uppercase tracking-[0.3em] text-white/40">
          Need to preview without uploading? <button type="button" className="font-semibold text-white" onClick={() => router.push("/")}>Open default design</button>
        </div>
      </div>
    </div>
  );
}
