const extensionApi = globalThis.browser ?? chrome;

document.getElementById("capture-all").addEventListener("click", () => {
  openDashboard("all");
});

document.getElementById("open-dashboard").addEventListener("click", () => {
  openDashboard();
});

async function openDashboard(scope) {
  const response = await extensionApi.runtime.sendMessage({
    type: "open-dashboard",
    scope: scope || null
  });

  if (response?.ok) {
    window.close();
  }
}
