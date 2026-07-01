/**
 * Idol-system API settings panel.
 * Matches the ST_Music-style independent API runtime in UserApi.js.
 */
(function () {
  "use strict";

  const VIEW_IDOL = "idol";

  const esc = (value) =>
    `${value ?? ""}`
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function getService() {
    return window.IdolApiService || null;
  }

  function getProviderOptions(selectedProvider) {
    const providers = getService().getProviderDefinitions();
    return Object.values(providers)
      .map((provider) => `<option value="${esc(provider.id)}" ${provider.id === selectedProvider ? "selected" : ""}>${esc(provider.label)}</option>`)
      .join("");
  }

  function getModelOptions(providerId, selectedModel) {
    const provider = getService().getProviderDefinitions()[providerId];
    if (!provider) return `<option value="${esc(selectedModel)}">${esc(selectedModel || "请选择供应商")}</option>`;
    const options = provider.models && provider.models.length ? provider.models : [{ value: provider.defaultModel, label: provider.defaultModel }];
    const customOption = selectedModel && !options.some((item) => item.value === selectedModel)
      ? `<option value="${esc(selectedModel)}" selected>${esc(selectedModel)}</option>`
      : "";
    return customOption + options
      .map((model) => `<option value="${esc(model.value)}" ${model.value === selectedModel ? "selected" : ""}>${esc(model.label || model.value)}</option>`)
      .join("");
  }

  function profileBlock(name, title, profile) {
    const providers = getService().getProviderDefinitions();
    const provider = providers[profile.provider] || providers.openai;
    const isMainApi = profile.provider === "sillytavern";
    const customUrlStyle = profile.provider === "custom" ? "" : "display:none";
    const independentFieldStyle = isMainApi ? "display:none" : "";
    return `
      <div class="idol-preset-block idol-api-profile" data-profile="${name}">
        <h4>${title}</h4>
        <div class="idol-form-row">
          <div class="idol-form-group">
            <label>API Provider</label>
            <select id="idol-${name}-provider" class="idol-model-select" onchange="window.IdolSettings.onProviderChange('${name}')">
              ${getProviderOptions(profile.provider)}
            </select>
          </div>
          <div class="idol-form-group idol-independent-api-field" style="${independentFieldStyle}">
            <label>Model</label>
            <select id="idol-${name}-model-select" class="idol-model-select" onchange="window.IdolSettings.onModelSelect('${name}')">
              ${getModelOptions(profile.provider, profile.model)}
            </select>
            <input type="text" id="idol-${name}-model" value="${esc(profile.model || provider.defaultModel || "")}" placeholder="model id">
          </div>
        </div>
        <div class="idol-form-group idol-custom-url-row idol-independent-api-field" id="idol-${name}-custom-url-row" style="${isMainApi ? "display:none" : customUrlStyle}">
          <label>OpenAI-compatible API 地址</label>
          <input type="text" id="idol-${name}-url" value="${esc(profile.url || "")}" placeholder="https://api.example.com/v1">
        </div>
        <div class="idol-form-group idol-independent-api-field" style="${independentFieldStyle}">
          <label>API 密钥</label>
          <input type="password" id="idol-${name}-key" value="${esc(profile.key || "")}" placeholder="${esc(provider.keyPlaceholder || "sk-...")}">
        </div>
        <div class="idol-form-row idol-independent-api-field" style="${independentFieldStyle}">
          <div class="idol-form-group">
            <label>Temperature</label>
            <input type="number" id="idol-${name}-temperature" value="${esc(profile.temperature ?? 0.8)}" min="0" max="2" step="0.1">
          </div>
          <div class="idol-form-group">
            <label>Max Tokens</label>
            <input type="number" id="idol-${name}-tokens" value="${esc(profile.max_tokens ?? 3000)}" min="100" max="16000" step="100">
          </div>
        </div>
        <div class="idol-form-group idol-main-api-note" style="${isMainApi ? "" : "display:none"}">
          <small>将直接使用 SillyTavern 当前主 API / 当前模型，不需要填写独立 API 地址或密钥。</small>
        </div>
      </div>
    `;
  }

  function createSettingsHTML() {
    const service = getService();
    if (!service) {
      return "<div style='color:#c0392b;padding:20px;'>API 服务未加载，请确认 UserApi.js 已放入插件目录。</div>";
    }

    const apiConfig = service.getApiProfileConfig();
    const presets = service.getPresets();
    const contextCount = service.getContextCount();
    const route = apiConfig.viewApiMap?.[VIEW_IDOL] === "secondary" ? "secondary" : "primary";

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
            <h3><i class="fa-solid fa-plug"></i> 独立 API 配置</h3>
            <div class="idol-settings-form">
              ${profileBlock("primary", "01 / Primary API", apiConfig.primary)}

              <div class="idol-preset-block">
                <h4>02 / Secondary API</h4>
                <div class="idol-form-group">
                  <label>启用备用 API</label>
                  <select id="idol-enable-second-api" class="idol-model-select" onchange="window.IdolSettings.onSecondApiToggle()">
                    <option value="false" ${apiConfig.enableSecondApi ? "" : "selected"}>关闭</option>
                    <option value="true" ${apiConfig.enableSecondApi ? "selected" : ""}>开启</option>
                  </select>
                </div>
                <div id="idol-secondary-profile-wrap" style="${apiConfig.enableSecondApi ? "" : "display:none"}">
                  ${profileBlock("secondary", "备用 API 资料", apiConfig.secondary)}
                  <div class="idol-form-group">
                    <label>偶像系统使用</label>
                    <select id="idol-api-route" class="idol-model-select">
                      <option value="primary" ${route === "primary" ? "selected" : ""}>Primary API</option>
                      <option value="secondary" ${route === "secondary" ? "selected" : ""}>Secondary API</option>
                    </select>
                  </div>
                </div>
              </div>

              <button class="idol-btn idol-btn-primary" onclick="window.IdolSettings.saveApiConfig()">
                <i class="fa-solid fa-save"></i> 保存 API 配置
              </button>
            </div>
          </div>

          <div class="idol-settings-section idol-settings-context-section">
            <h3><i class="fa-solid fa-comments"></i> 上下文配置</h3>
            <div class="idol-settings-form">
              <div class="idol-form-group">
                <label>读取最近消息数</label>
                <input type="number" id="idol-context-count" value="${esc(contextCount)}" min="0" max="20" step="1">
              </div>
              <button class="idol-btn idol-btn-primary" onclick="window.IdolSettings.saveContextCount()">
                <i class="fa-solid fa-save"></i> 保存上下文配置
              </button>
            </div>
          </div>

          <div class="idol-settings-section idol-settings-presets-section">
            <h3><i class="fa-solid fa-file-lines"></i> 预设配置</h3>
            ${presetBlock("contracts", "通告生成", presets.contracts)}
            ${presetBlock("shop", "商品刷新", presets.shop)}
            ${presetBlock("news", "日报生成", presets.news)}
            <button class="idol-btn idol-btn-primary" onclick="window.IdolSettings.savePresets()">
              <i class="fa-solid fa-save"></i> 保存预设配置
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function presetBlock(key, title, preset) {
    return `
      <div class="idol-preset-block">
        <h4>${title}</h4>
        <div class="idol-form-group">
          <label>System Prompt</label>
          <textarea id="idol-preset-${key}-system" rows="6">${esc(preset?.system || "")}</textarea>
        </div>
        <div class="idol-form-group">
          <label>User Prompt</label>
          <input type="text" id="idol-preset-${key}-user" value="${esc(preset?.userPrompt || "")}">
        </div>
      </div>
    `;
  }

  function readProfile(name) {
    const provider = document.getElementById(`idol-${name}-provider`)?.value || "openai";
    const modelInput = document.getElementById(`idol-${name}-model`);
    const modelSelect = document.getElementById(`idol-${name}-model-select`);
    return {
      provider,
      model: (modelInput?.value || modelSelect?.value || "").trim(),
      key: document.getElementById(`idol-${name}-key`)?.value.trim() || "",
      url: document.getElementById(`idol-${name}-url`)?.value.trim() || "",
      temperature: parseFloat(document.getElementById(`idol-${name}-temperature`)?.value) || 0.8,
      max_tokens: parseInt(document.getElementById(`idol-${name}-tokens`)?.value, 10) || 3000,
    };
  }

  function onProviderChange(name) {
    const service = getService();
    const providerId = document.getElementById(`idol-${name}-provider`).value;
    const provider = service.getProviderDefinitions()[providerId];
    const select = document.getElementById(`idol-${name}-model-select`);
    const input = document.getElementById(`idol-${name}-model`);
    const keyInput = document.getElementById(`idol-${name}-key`);
    const urlRow = document.getElementById(`idol-${name}-custom-url-row`);
    const block = document.querySelector(`.idol-api-profile[data-profile="${name}"]`);
    const isMainApi = providerId === "sillytavern";

    select.innerHTML = getModelOptions(providerId, provider?.defaultModel || "");
    input.value = provider?.defaultModel || "";
    keyInput.placeholder = provider?.keyPlaceholder || "sk-...";
    if (urlRow) urlRow.style.display = providerId === "custom" && !isMainApi ? "" : "none";
    if (block) {
      block.querySelectorAll(".idol-independent-api-field").forEach((el) => {
        el.style.display = isMainApi ? "none" : "";
      });
      block.querySelectorAll(".idol-main-api-note").forEach((el) => {
        el.style.display = isMainApi ? "" : "none";
      });
    }
  }

  function onModelSelect(name) {
    const select = document.getElementById(`idol-${name}-model-select`);
    const input = document.getElementById(`idol-${name}-model`);
    if (select && input) input.value = select.value;
  }

  function onSecondApiToggle() {
    const enabled = document.getElementById("idol-enable-second-api")?.value === "true";
    const wrap = document.getElementById("idol-secondary-profile-wrap");
    if (wrap) wrap.style.display = enabled ? "" : "none";
  }

  function saveApiConfig() {
    const service = getService();
    const enabled = document.getElementById("idol-enable-second-api")?.value === "true";
    const config = {
      version: 4,
      enableSecondApi: enabled,
      primary: readProfile("primary"),
      secondary: readProfile("secondary"),
      viewApiMap: {
        [VIEW_IDOL]: enabled ? (document.getElementById("idol-api-route")?.value || "primary") : "primary",
      },
    };

    alert(service.saveApiProfileConfig(config) ? "API 配置已保存。" : "保存失败，请检查控制台。");
  }

  function saveContextCount() {
    const count = parseInt(document.getElementById("idol-context-count")?.value, 10) || 3;
    alert(getService().saveContextCount(count) ? "上下文配置已保存。" : "保存失败，请检查控制台。");
  }

  function savePresets() {
    const readPreset = (key, name) => ({
      name,
      system: document.getElementById(`idol-preset-${key}-system`)?.value.trim() || "",
      userPrompt: document.getElementById(`idol-preset-${key}-user`)?.value.trim() || "",
    });

    const presets = {
      contracts: readPreset("contracts", "通告生成"),
      shop: readPreset("shop", "商品刷新"),
      news: readPreset("news", "日报生成"),
    };

    alert(getService().savePresets(presets) ? "预设配置已保存。" : "保存失败，请检查控制台。");
  }

  function showSettings() {
    const oldPanel = document.getElementById("idol-settings-overlay");
    if (oldPanel) oldPanel.remove();

    const overlay = document.createElement("div");
    overlay.id = "idol-settings-overlay";
    overlay.className = "idol-settings-overlay";
    overlay.innerHTML = createSettingsHTML();
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeSettings();
    });
  }

  function renderSettings(container) {
    if (!container) return;
    const oldPanel = document.getElementById("idol-settings-overlay");
    if (oldPanel) oldPanel.remove();
    container.innerHTML = `<div class="idol-settings-inline">${createSettingsHTML()}</div>`;
  }

  function closeSettings() {
    const overlay = document.getElementById("idol-settings-overlay");
    if (overlay) overlay.remove();
  }

  async function fetchModels() {
    alert("新版独立 API 使用固定供应商模型列表，不再需要单独获取模型。");
  }

  window.IdolSettings = {
    showSettings,
    renderSettings,
    closeSettings,
    saveApiConfig,
    saveContextCount,
    savePresets,
    fetchModels,
    onProviderChange,
    onModelSelect,
    onSecondApiToggle,
  };

  console.info("[Idol Settings] ST_Music-style settings loaded.");
})();
