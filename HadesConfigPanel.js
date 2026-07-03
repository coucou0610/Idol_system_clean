/**
 * HADES API settings panel.
 * Keeps the compact API settings UI and adds an option to use SillyTavern's main API.
 */
(function () {
  "use strict";

  function getService() {
    return window.HadesApiBridge;
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getCurrentProfile() {
    const service = getService();
    if (!service) return {};
    if (typeof service.readHadesProfiles === "function") {
      return service.readHadesProfiles().primary || {};
    }
    return service.readHadesApiProfile?.() || {};
  }

  function buildHadesSettingsMarkup() {
    const service = getService();
    if (!service) {
      return "<div style='color:#c0392b;padding:20px;'>API 模块加载失败，请确认 HadesApiBridge.js 已放入插件目录。</div>";
    }

    const profile = getCurrentProfile();
    const useMainApi = profile.provider === "sillytavern";

    return `
      <div class="hades-settings-panel">
        <div class="hades-settings-header">
          <h2>插件设置</h2>
          <button class="hades-settings-close" onclick="window.HadesConfigPanel.closeHadesSettings()">
            <i class="fa-solid fa-times"></i>
          </button>
        </div>

        <div class="hades-settings-content">
          <div class="hades-settings-section hades-settings-api-section">
            <h3><i class="fa-solid fa-plug"></i> API 配置</h3>
            <div class="hades-settings-form">
              <label class="hades-main-api-toggle">
                <input type="checkbox" id="hades-use-main-api" ${useMainApi ? "checked" : ""} onchange="window.HadesConfigPanel.syncProviderMode()">
                <span>使用酒馆主 API</span>
              </label>
              <small class="hades-main-api-help">勾选后将直接调用 SillyTavern 当前启用的主 API 和模型，不再读取下方独立 API 配置。</small>

              <div class="hades-independent-api-fields" style="${useMainApi ? "display:none" : ""}">
                <div class="hades-form-group">
                  <label>API 地址</label>
                  <input type="text" id="hades-api-url" value="${esc(profile.url || "")}" placeholder="https://api.openai.com/v1 或 https://gcli.ggchan.dev/v1">
                </div>

                <div class="hades-form-group">
                  <label>API 密钥</label>
                  <div class="hades-api-key-row">
                    <input type="password" id="hades-api-key" value="${esc(profile.key || "")}" placeholder="sk-...">
                    <button class="hades-btn hades-btn-secondary hades-fetch-models-btn" onclick="window.HadesConfigPanel.showManualModelNotice()" type="button">
                      <i class="fa-solid fa-arrows-rotate"></i> 获取模型
                    </button>
                  </div>
                </div>

                <div class="hades-form-group">
                  <label>模型名称</label>
                  <input type="text" id="hades-api-model" value="${esc(profile.model || "")}" placeholder="gpt-4o-mini">
                </div>
              </div>

              <div class="hades-form-row">
                <div class="hades-form-group">
                  <label>Temperature</label>
                  <input type="number" id="hades-api-temperature" value="${esc(profile.temperature ?? 0.8)}" min="0" max="2" step="0.1">
                </div>
                <div class="hades-form-group">
                  <label>Max Tokens</label>
                  <input type="number" id="hades-api-tokens" value="${esc(profile.max_tokens ?? 4000)}" min="100" max="16000" step="100">
                </div>
              </div>

              <button class="hades-btn hades-btn-primary" onclick="window.HadesConfigPanel.persistHadesApiProfile()" type="button">
                <i class="fa-solid fa-save"></i> 保存 API 配置
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function openHadesSettingsOverlay() {
    const oldPanel = document.getElementById("hades-settings-overlay");
    if (oldPanel) oldPanel.remove();

    const overlay = document.createElement("div");
    overlay.id = "hades-settings-overlay";
    overlay.className = "hades-settings-overlay";
    overlay.innerHTML = buildHadesSettingsMarkup();
    document.body.appendChild(overlay);
    syncProviderMode();
  }

  function mountHadesSettings(container) {
    if (!container) return;
    const oldPanel = document.getElementById("hades-settings-overlay");
    if (oldPanel) oldPanel.remove();
    container.innerHTML = `<div class="hades-settings-inline">${buildHadesSettingsMarkup()}</div>`;
    syncProviderMode();
  }

  function closeHadesSettings() {
    const overlay = document.getElementById("hades-settings-overlay");
    if (overlay) overlay.remove();
  }

  function syncProviderMode() {
    const checked = Boolean(document.getElementById("hades-use-main-api")?.checked);
    document.querySelectorAll(".hades-independent-api-fields").forEach((el) => {
      el.style.display = checked ? "none" : "";
      el.querySelectorAll("input, button, select, textarea").forEach((field) => {
        field.disabled = checked;
      });
    });
  }

  function persistHadesApiProfile() {
    const service = getService();
    if (!service) {
      alert("API 模块尚未加载。");
      return;
    }

    const useMainApi = Boolean(document.getElementById("hades-use-main-api")?.checked);
    const temperature = parseFloat(document.getElementById("hades-api-temperature")?.value) || 0.8;
    const maxTokens = parseInt(document.getElementById("hades-api-tokens")?.value, 10) || 4000;
    const nextProfile = useMainApi
      ? {
          provider: "sillytavern",
          url: "",
          key: "",
          model: "",
          temperature,
          max_tokens: maxTokens,
        }
      : {
          provider: "custom",
          url: document.getElementById("hades-api-url")?.value.trim() || "",
          key: document.getElementById("hades-api-key")?.value.trim() || "",
          model: document.getElementById("hades-api-model")?.value.trim() || "",
          temperature,
          max_tokens: maxTokens,
        };

    if (typeof service.readHadesProfiles === "function" && typeof service.writeHadesProfiles === "function") {
      const config = service.readHadesProfiles();
      config.primary = nextProfile;
      config.enableSecondApi = false;
      config.viewApiMap = { ...(config.viewApiMap || {}), hades: "primary" };
      service.writeHadesProfiles(config);
    } else if (typeof service.persistHadesApiProfile === "function") {
      service.persistHadesApiProfile(nextProfile);
    }

    if (typeof toastr !== "undefined") toastr.success("API 配置已保存");
    else alert("API 配置已保存");
  }

  async function showManualModelNotice() {
    alert("当前版本请直接填写模型名称。");
  }

  window.HadesConfigPanel = {
    openHadesSettingsOverlay,
    mountHadesSettings,
    closeHadesSettings,
    persistHadesApiProfile,
    showManualModelNotice,
    syncProviderMode,
  };

  console.info("[HADES Config Panel] compact settings loaded.");
})();






