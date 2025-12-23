'use client';

import Home, { defaultConfig } from "@/components/Home";

type EmbedPageProps = {
  searchParams?: {
    model?: string;
    config?: string;
  };
};

export default function EmbedPage({ searchParams }: EmbedPageProps) {
  const { model, config } = searchParams ?? {};
  let parsedConfig = defaultConfig;
  if (config) {
    try {
      parsedConfig = JSON.parse(decodeURIComponent(config));
    } catch {
      parsedConfig = defaultConfig;
    }
  }
  const configWithModel = model
    ? {
        ...parsedConfig,
        scene: {
          ...parsedConfig.scene,
          model: {
            ...parsedConfig.scene.model,
            src: model,
          },
        },
      }
    : parsedConfig;

  const handleStateChange = (state: { selections: Record<string, string>; totalPrice: number }) => {
    if (window.parent) {
      window.parent.postMessage(
        { type: 'configurator-state-change', payload: state },
        '*' // In a real application, specify the parent's origin for security
      );
    }
  };

  return <Home config={configWithModel} initialMode="preview" allowModeSwitch={false} onStateChange={handleStateChange} />;
}
