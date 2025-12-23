(() => {
  const script = document.currentScript;
  if (!script) return;
  const dataset = script.dataset;

  const targetId = dataset.target || "configurator-embed";
  const target = document.getElementById(targetId);
  if (!target) return;

  const baseUrl = new URL(script.src, window.location.href);
  baseUrl.pathname = "/embed";

  const params = new URLSearchParams();
  if (dataset.model) {
    params.set("model", dataset.model);
  }
  if (dataset.config) {
    params.set("config", dataset.config);
  }

  const iframe = document.createElement("iframe");
  iframe.src = params.toString() ? `${baseUrl.toString()}?${params.toString()}` : baseUrl.toString();
  iframe.width = dataset.width || "100%";
  iframe.height = dataset.height || "600";
  iframe.frameBorder = "0";
  iframe.allowFullscreen = true;
  iframe.style.border = "0";
  iframe.style.width = iframe.width === "100%" ? "100%" : `${iframe.width}px`;
  iframe.style.height = `${iframe.height}px`;
  iframe.id = `${targetId}-iframe`; // Assign a unique ID to the iframe

  target.innerHTML = "";
  target.appendChild(iframe);

  // Add event listener for messages from the iframe
  window.addEventListener('message', (event) => {
    // Only process messages from the expected iframe and with the correct type
    if (iframe.contentWindow === event.source && event.data && event.data.type === 'configurator-state-change') {
      const customEvent = new CustomEvent('configurator-state-change', {
        detail: event.data.payload,
      });
      target.dispatchEvent(customEvent);
    }
  });
})();
