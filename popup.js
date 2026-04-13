const extensionApi = globalThis.browser ?? chrome;

document.getElementById("capture-all").addEventListener("click", () => {
  openDashboard({
    capture: "all"
  });
});

document.getElementById("open-dashboard").addEventListener("click", () => {
  openDashboard({
    view: "library"
  });
});

async function openDashboard(intent) {
  const response = await extensionApi.runtime.sendMessage({
    type: "open-dashboard",
    payload: intent || null
  });

  if (response?.ok) {
    window.close();
  }
}
