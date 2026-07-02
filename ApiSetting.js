/**
 * Idol-system settings panel.
 * Keeps the compact API settings UI and adds an option to use SillyTavern's main API.
 */
(function () {
  "use strict";

  function getService() {
    return window.IdolApiService || window.UserApiService;
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
    if (typeof service.getApiProfileConfig === "function") {
      return service.getApiProfileConfig().primary || {};
    }
    return service.getApiConfig?.() || {};
  }

  function createSettingsHTML() {
    const service = getService();
    if (!service) {
      return "<div style='color:#c0392b;padding:20px;'>API 模块加载失败，请确认 UserApi.js 已放入插件目录。</div>";
    }

    const profile = getCurrentProfile();
    const useMainApi = profile.provider === "sillytavern";

    return `
      <div class="idol-settings-panel">
        <div class="idol-settings-header">
          <h2>插件设置</h2>
          <button class="idol-settings-close" onclick="window.IdolSettings.closeSettings()">
            <i class="fa-solid fa-times"></i>
          </button>
        </div>

        <div class="idol-settings-content">
          <div class="idol-settings-section idol-settings-api-section">
            <h3><i class="fa-solid fa-plug"></i> API 配置</h3>
            <div class="idol-settings-form">
              <label class="idol-main-api-toggle">
                <input type="checkbox" id="idol-use-main-api" ${useMainApi ? "checked" : ""} onchange="window.IdolSettings.onMainApiToggle()">
                <span>使用酒馆主 API</span>
              </label>
              <small class="idol-main-api-help">勾选后将直接调用 SillyTavern 当前启用的主 API 和模型，不再读取下方独立 API 配置。</small>

              <div class="idol-independent-api-fields" style="${useMainApi ? "display:none" : ""}">
                <div class="idol-form-group">
                  <label>API 地址</label>
                  <input type="text" id="idol-api-url" value="${esc(profile.url || "")}" placeholder="https://api.openai.com/v1 或 https://gcli.ggchan.dev/v1">
                </div>

                <div class="idol-form-group">
                  <label>API 密钥</label>
                  <div class="idol-api-key-row">
                    <input type="password" id="idol-api-key" value="${esc(profile.key || "")}" placeholder="sk-...">
                    <button class="idol-btn idol-btn-secondary idol-fetch-models-btn" onclick="window.IdolSettings.fetchModels()" type="button">
                      <i class="fa-solid fa-arrows-rotate"></i> 获取模型
                    </button>
                  </div>
                </div>

                <div class="idol-form-group">
                  <label>模型名称</label>
                  <input type="text" id="idol-api-model" value="${esc(profile.model || "")}" placeholder="gpt-4o-mini">
                </div>
              </div>

              <div class="idol-form-row">
                <div class="idol-form-group">
                  <label>Temperature</label>
                  <input type="number" id="idol-api-temperature" value="${esc(profile.temperature ?? 0.8)}" min="0" max="2" step="0.1">
                </div>
                <div class="idol-form-group">
                  <label>Max Tokens</label>
                  <input type="number" id="idol-api-tokens" value="${esc(profile.max_tokens ?? 4000)}" min="100" max="16000" step="100">
                </div>
              </div>

              <button class="idol-btn idol-btn-primary" onclick="window.IdolSettings.saveApiConfig()" type="button">
                <i class="fa-solid fa-save"></i> 保存 API 配置
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function showSettings() {
    const oldPanel = document.getElementById("idol-settings-overlay");
    if (oldPanel) oldPanel.remove();

    const overlay = document.createElement("div");
    overlay.id = "idol-settings-overlay";
    overlay.className = "idol-settings-overlay";
    overlay.innerHTML = createSettingsHTML();
    document.body.appendChild(overlay);
    onMainApiToggle();
  }

  function renderSettings(container) {
    if (!container) return;
    const oldPanel = document.getElementById("idol-settings-overlay");
    if (oldPanel) oldPanel.remove();
    container.innerHTML = `<div class="idol-settings-inline">${createSettingsHTML()}</div>`;
    onMainApiToggle();
  }

  function closeSettings() {
    const overlay = document.getElementById("idol-settings-overlay");
    if (overlay) overlay.remove();
  }

  function onMainApiToggle() {
    const checked = Boolean(document.getElementById("idol-use-main-api")?.checked);
    document.querySelectorAll(".idol-independent-api-fields").forEach((el) => {
      el.style.display = checked ? "none" : "";
      el.querySelectorAll("input, button, select, textarea").forEach((field) => {
        field.disabled = checked;
      });
    });
  }

  function saveApiConfig() {
    const service = getService();
    if (!service) {
      alert("API 模块尚未加载。");
      return;
    }

    const useMainApi = Boolean(document.getElementById("idol-use-main-api")?.checked);
    const temperature = parseFloat(document.getElementById("idol-api-temperature")?.value) || 0.8;
    const maxTokens = parseInt(document.getElementById("idol-api-tokens")?.value, 10) || 4000;
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
          url: document.getElementById("idol-api-url")?.value.trim() || "",
          key: document.getElementById("idol-api-key")?.value.trim() || "",
          model: document.getElementById("idol-api-model")?.value.trim() || "",
          temperature,
          max_tokens: maxTokens,
        };

    if (typeof service.getApiProfileConfig === "function" && typeof service.saveApiProfileConfig === "function") {
      const config = service.getApiProfileConfig();
      config.primary = nextProfile;
      config.enableSecondApi = false;
      config.viewApiMap = { ...(config.viewApiMap || {}), idol: "primary" };
      service.saveApiProfileConfig(config);
    } else if (typeof service.saveApiConfig === "function") {
      service.saveApiConfig(nextProfile);
    }

    if (typeof toastr !== "undefined") toastr.success("API 配置已保存");
    else alert("API 配置已保存");
  }

  async function fetchModels() {
    alert("当前版本请直接填写模型名称。");
  }

  window.IdolSettings = {
    showSettings,
    renderSettings,
    closeSettings,
    saveApiConfig,
    fetchModels,
    onMainApiToggle,
  };

  console.info("[Idol Settings] compact settings loaded.");
})();
