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

  function getProviders() {
    const service = getService();
    return service?.listHadesProviders?.() || {};
  }

  function providerForSettings(profile) {
    if (profile.provider === "custom") return "openai";
    if (profile.provider === "sillytavern") return "chatgpt";
    return profile.provider || "chatgpt";
  }

  function providerOptions(selected) {
    const providers = getProviders();
    const ids = ["openai", "chatgpt", "claude", "gemini", "deepseek", "minimax"];
    return ids.map((id) => {
      const label = providers[id]?.label || id;
      return `<option value="${esc(id)}" ${id === selected ? "selected" : ""}>${esc(label)}</option>`;
    }).join("");
  }

  function shouldKeepSavedModel(providerId, model) {
    const value = String(model || "").trim();
    if (!value) return false;
    if ((providerId === "openai" || providerId === "chatgpt") && value === "gpt-5.5") return false;
    return true;
  }

  function modelOptions(providerId, currentModel) {
    const saved = String(currentModel || "").trim();
    const values = shouldKeepSavedModel(providerId, saved) ? [saved] : [];
    return [
      `<option value="" selected></option>`,
      ...values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`),
    ].join("");
  }

  function modelValues(providerId) {
    const provider = getProviders()[providerId] || {};
    return (Array.isArray(provider.models) ? provider.models : [])
      .map((model) => model?.value)
      .filter(Boolean);
  }

  function setModelChoices(models, options = {}) {
    const keepCurrent = Boolean(options.keepCurrent);
    const modelSelect = document.getElementById("hades-api-model");
    const current = String(modelSelect?.value || "").trim();
    const provider = document.getElementById("hades-api-provider")?.value || "";
    const values = [...new Set((models || []).map((model) => String(model || "").trim()).filter((model) => shouldKeepSavedModel(provider, model)))];
    if (keepCurrent && shouldKeepSavedModel(provider, current) && !values.includes(current)) values.unshift(current);
    if (modelSelect) {
      modelSelect.innerHTML = [`<option value=""></option>`, ...values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`)].join("");
    }
    if (modelSelect) {
      modelSelect.value = keepCurrent && current && values.includes(current) ? current : "";
    }
    return values;
  }

  function currentProviderModels(providerId) {
    const values = modelValues(providerId);
    return values.length ? values : [document.getElementById("hades-api-model")?.value || ""].filter(Boolean);
  }

  function apiBaseToModelsEndpoint(baseUrl) {
    const clean = String(baseUrl || "").trim().replace(/\/+$/, "");
    if (!clean) return "";
    if (/\/models$/i.test(clean)) return clean;
    if (/\/chat\/completions$/i.test(clean)) return clean.replace(/\/chat\/completions$/i, "/models");
    if (/\/v\d+$/i.test(clean)) return `${clean}/models`;
    return `${clean}/v1/models`;
  }

  function modelFetchPlan(provider, url, key) {
    const headers = {};
    if (provider === "openai") return { url: apiBaseToModelsEndpoint(url), headers: key ? { Authorization: `Bearer ${key}` } : {} };
    if (provider === "chatgpt") return { url: "https://api.openai.com/v1/models", headers: { Authorization: `Bearer ${key}` } };
    if (provider === "deepseek") return { url: "https://api.deepseek.com/models", headers: { Authorization: `Bearer ${key}` } };
    if (provider === "claude") {
      headers["x-api-key"] = key;
      headers["anthropic-version"] = "2023-06-01";
      headers["anthropic-dangerous-direct-browser-access"] = "true";
      return { url: "https://api.anthropic.com/v1/models", headers };
    }
    if (provider === "gemini") return { url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, headers };
    if (provider === "minimax") return { url: "https://api.minimax.io/v1/models", headers: { Authorization: `Bearer ${key}` } };
    return { url: "", headers };
  }

  function readModelsFromPayload(payload, provider) {
    const data = Array.isArray(payload?.data) ? payload.data : [];
    if (provider === "gemini") {
      return (Array.isArray(payload?.models) ? payload.models : [])
        .map((model) => String(model?.name || "").replace(/^models\//, ""))
        .filter(Boolean);
    }
    return [
      ...data.map((model) => model?.id || model?.name || model?.model),
      ...(Array.isArray(payload?.models) ? payload.models.map((model) => model?.id || model?.name || model?.model || model) : []),
    ].filter(Boolean);
  }

  function notify(message, type = "success") {
    if (typeof toastr !== "undefined") {
      if (type === "error") toastr.error(message);
      else if (type === "warning") toastr.warning(message);
      else toastr.success(message);
      return;
    }
    alert(message);
  }

  function buildHadesSettingsMarkup() {
    const service = getService();
    if (!service) {
      return "<div style='color:#c0392b;padding:20px;'>API 模块加载失败，请确认 HadesApiBridge.js 已放入插件目录。</div>";
    }

    const profile = getCurrentProfile();
    const useMainApi = profile.provider === "sillytavern";
    const selectedProvider = providerForSettings(profile);
    const needsUrl = selectedProvider === "openai";

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
                  <label>官方 API 类型</label>
                  <select id="hades-api-provider" onchange="window.HadesConfigPanel.syncProviderMode()">
                    ${providerOptions(selectedProvider)}
                  </select>
                </div>

                <div class="hades-form-group hades-api-url-group" style="${needsUrl ? "" : "display:none"}">
                  <label>API 地址</label>
                  <input type="text" id="hades-api-url" value="${esc(profile.url || "")}" placeholder="https://api.openai.com/v1 或 https://gcli.ggchan.dev/v1">
                  <small class="hades-field-help">仅 OpenAI / OpenAI 兼容接口需要填写。其它官方接口会自动使用默认地址。</small>
                </div>

                <div class="hades-form-group">
                  <label>API 密钥</label>
                  <input type="password" id="hades-api-key" value="${esc(profile.key || "")}" placeholder="sk-...">
                </div>

                <div class="hades-form-group">
                  <label>模型名称</label>
                  <div class="hades-api-model-row">
                    <select id="hades-api-model">
                      ${modelOptions(selectedProvider, profile.model || "")}
                    </select>
                    <button class="hades-btn hades-btn-secondary hades-fetch-models-btn" onclick="window.HadesConfigPanel.fetchProviderModels()" type="button">
                      <i class="fa-solid fa-arrows-rotate"></i> 获取模型
                    </button>
                  </div>
                  <small class="hades-field-help">会按当前 API 类型读取可用模型；如果接口不允许浏览器读取，会使用内置推荐列表。</small>
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
    const provider = document.getElementById("hades-api-provider")?.value || "chatgpt";
    const needsUrl = provider === "openai";
    document.querySelectorAll(".hades-independent-api-fields").forEach((el) => {
      el.style.display = checked ? "none" : "";
      el.querySelectorAll("input, button, select, textarea").forEach((field) => {
        field.disabled = checked;
      });
    });
    document.querySelectorAll(".hades-api-url-group").forEach((el) => {
      el.style.display = !checked && needsUrl ? "" : "none";
    });

    setModelChoices(currentProviderModels(provider));
  }

  async function fetchProviderModels() {
    const provider = document.getElementById("hades-api-provider")?.value || "chatgpt";
    const key = document.getElementById("hades-api-key")?.value.trim() || "";
    const url = document.getElementById("hades-api-url")?.value.trim() || "";
    const button = document.querySelector(".hades-fetch-models-btn");
    const fallback = modelValues(provider);

    if (provider === "openai" && !url) {
      notify("请先填写 OpenAI / OpenAI 兼容接口的 API 地址。", "error");
      return;
    }
    if (!key) {
      notify("请先填写 API 密钥。", "error");
      return;
    }

    const plan = modelFetchPlan(provider, url, key);
    if (!plan.url) {
      setModelChoices(fallback);
      notify("当前 API 类型暂不支持在线获取模型，已显示内置推荐模型。", "warning");
      return;
    }

    try {
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 获取中';
      }
      const response = await fetch(plan.url, { headers: plan.headers });
      if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
      const payload = await response.json();
      const models = readModelsFromPayload(payload, provider);
      if (!models.length) throw new Error("没有读取到模型列表");
      setModelChoices(models, { keepCurrent: true });
      notify(`已获取 ${models.length} 个模型`);
    } catch (error) {
      setModelChoices(fallback);
      console.warn("[HADES Config Panel] model fetch failed:", error);
      notify("在线获取模型失败，已显示内置推荐模型。部分官方接口会阻止浏览器直接读取模型列表。", "warning");
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> 获取模型';
      }
    }
  }

  function persistHadesApiProfile() {
    const service = getService();
    if (!service) {
      alert("API 模块尚未加载。");
      return;
    }

    const useMainApi = Boolean(document.getElementById("hades-use-main-api")?.checked);
    const provider = document.getElementById("hades-api-provider")?.value || "chatgpt";
    const temperature = parseFloat(document.getElementById("hades-api-temperature")?.value) || 0.8;
    const maxTokens = parseInt(document.getElementById("hades-api-tokens")?.value, 10) || 4000;
    const selectedModel = document.getElementById("hades-api-model")?.value.trim() || "";

    if (!useMainApi && !selectedModel) {
      notify("请先点击获取模型并选择模型名称。", "error");
      return;
    }

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
          provider,
          url: provider === "openai" ? (document.getElementById("hades-api-url")?.value.trim() || "") : "",
          key: document.getElementById("hades-api-key")?.value.trim() || "",
          model: selectedModel,
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

  window.HadesConfigPanel = {
    openHadesSettingsOverlay,
    mountHadesSettings,
    closeHadesSettings,
    persistHadesApiProfile,
    fetchProviderModels,
    syncProviderMode,
  };

  console.info("[HADES Config Panel] compact settings loaded.");
})();






