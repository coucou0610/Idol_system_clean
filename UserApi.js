/**
 * Idol-system independent API runtime.
 * Reworked with the ST_Music-style provider/profile/adapter structure while
 * keeping the old IdolApiService public API for the map, shop and news modules.
 */
(function () {
  "use strict";

  const VIEW_IDOL = "idol";
  const STORAGE_KEYS = {
    API_CONFIG: "idol_system_api_profiles",
    PRESETS: "idol_system_prompt_presets",
    CONTEXT_COUNT: "idol_system_context_window",
  };

  const modelOption = (value, label = value) => Object.freeze({ value, label });

  const PROVIDERS = Object.freeze({
    openai: Object.freeze({
      id: "openai",
      label: "OpenAI",
      defaultModel: "gpt-4.1-mini",
      models: Object.freeze([
        modelOption("gpt-4.1-mini"),
        modelOption("gpt-4.1"),
        modelOption("gpt-4o-mini"),
        modelOption("gpt-4o"),
      ]),
      endpoint: "https://api.openai.com/v1/responses",
      keyPlaceholder: "sk-...",
    }),
    gemini: Object.freeze({
      id: "gemini",
      label: "Gemini",
      defaultModel: "gemini-2.5-flash",
      models: Object.freeze([
        modelOption("gemini-2.5-flash", "Gemini 2.5 Flash"),
        modelOption("gemini-2.5-pro", "Gemini 2.5 Pro"),
        modelOption("gemini-1.5-flash", "Gemini 1.5 Flash"),
      ]),
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
      keyPlaceholder: "AIza...",
    }),
    claude: Object.freeze({
      id: "claude",
      label: "Claude",
      defaultModel: "claude-3-5-sonnet-latest",
      models: Object.freeze([
        modelOption("claude-3-5-sonnet-latest", "Claude 3.5 Sonnet"),
        modelOption("claude-3-5-haiku-latest", "Claude 3.5 Haiku"),
        modelOption("claude-3-opus-latest", "Claude 3 Opus"),
      ]),
      endpoint: "https://api.anthropic.com/v1/messages",
      keyPlaceholder: "sk-ant-...",
      maxTokens: 3000,
    }),
    deepseek: Object.freeze({
      id: "deepseek",
      label: "DeepSeek",
      defaultModel: "deepseek-chat",
      models: Object.freeze([
        modelOption("deepseek-chat"),
        modelOption("deepseek-reasoner"),
      ]),
      endpoint: "https://api.deepseek.com/chat/completions",
      keyPlaceholder: "sk-...",
    }),
    minimax: Object.freeze({
      id: "minimax",
      label: "MiniMax",
      defaultModel: "MiniMax-Text-01",
      models: Object.freeze([
        modelOption("MiniMax-Text-01"),
        modelOption("abab6.5s-chat"),
      ]),
      endpoint: "https://api.minimaxi.com/v1/text/chatcompletion_v2",
      keyPlaceholder: "eyJ...",
      maxTokens: 3000,
    }),
    custom: Object.freeze({
      id: "custom",
      label: "OpenAI Compatible",
      defaultModel: "",
      models: Object.freeze([modelOption("")]),
      endpoint: "",
      keyPlaceholder: "sk-...",
    }),
  });

  const BLANK_PROFILE = Object.freeze({
    provider: "openai",
    model: PROVIDERS.openai.defaultModel,
    key: "",
    url: "",
    temperature: 0.8,
    max_tokens: 3000,
  });

  const DEFAULT_CONFIG = Object.freeze({
    version: 4,
    enableSecondApi: false,
    primary: { ...BLANK_PROFILE },
    secondary: { ...BLANK_PROFILE },
    viewApiMap: { [VIEW_IDOL]: "primary" },
  });

  let activeController = null;
  const dynamicUserPrompts = {};

  const getProviderDefinitions = () =>
    Object.fromEntries(
      Object.entries(PROVIDERS).map(([id, provider]) => [
        id,
        {
          id,
          label: provider.label,
          defaultModel: provider.defaultModel,
          models: provider.models.map((model) => ({ ...model })),
          keyPlaceholder: provider.keyPlaceholder,
          endpoint: provider.endpoint,
        },
      ]),
    );

  const normalizeProviderId = (provider) => {
    const id = `${provider || ""}`.trim().toLowerCase();
    return PROVIDERS[id] ? id : "openai";
  };

  const normalizeModelId = (providerId, model) => {
    const provider = PROVIDERS[normalizeProviderId(providerId)];
    const value = `${model || ""}`.trim();
    if (provider.id === "custom") return value;
    return provider.models.some((item) => item.value === value) ? value : provider.defaultModel;
  };

  const normalizeApiProfile = (profile) => {
    const input = profile && typeof profile === "object" ? profile : {};
    const provider = normalizeProviderId(input.provider || (input.url ? "custom" : "openai"));
    return {
      provider,
      model: normalizeModelId(provider, input.model),
      key: `${input.key || ""}`.trim(),
      url: `${input.url || ""}`.trim(),
      temperature: Number.isFinite(Number(input.temperature)) ? Number(input.temperature) : 0.8,
      max_tokens: Number.isFinite(Number(input.max_tokens)) ? Number(input.max_tokens) : 3000,
    };
  };

  const normalizeApiConfig = (config) => {
    const source = config && typeof config === "object" ? config : DEFAULT_CONFIG;
    if (source.primary || source.secondary) {
      return {
        version: 4,
        enableSecondApi: source.enableSecondApi === true,
        primary: normalizeApiProfile(source.primary),
        secondary: normalizeApiProfile(source.secondary),
        viewApiMap: {
          ...DEFAULT_CONFIG.viewApiMap,
          ...(source.viewApiMap && typeof source.viewApiMap === "object" ? source.viewApiMap : {}),
        },
      };
    }

    return {
      ...DEFAULT_CONFIG,
      primary: normalizeApiProfile(source),
    };
  };

  function getApiProfileConfig() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.API_CONFIG);
      if (stored) return normalizeApiConfig(JSON.parse(stored));
    } catch (error) {
      console.warn("[Idol API] Failed to read API config:", error);
    }
    return normalizeApiConfig(DEFAULT_CONFIG);
  }

  function saveApiProfileConfig(config) {
    try {
      const normalized = normalizeApiConfig(config);
      localStorage.setItem(STORAGE_KEYS.API_CONFIG, JSON.stringify(normalized));
      return true;
    } catch (error) {
      console.error("[Idol API] Failed to save API config:", error);
      return false;
    }
  }

  function loadApiConfigForView(viewType = VIEW_IDOL) {
    const config = getApiProfileConfig();
    const wantsSecondary = config.enableSecondApi && config.viewApiMap?.[viewType] === "secondary";
    const profile = wantsSecondary ? config.secondary : config.primary;
    if (wantsSecondary && !hasUsableProfile(profile)) return config.primary;
    return profile;
  }

  function getApiConfig() {
    const profile = loadApiConfigForView(VIEW_IDOL);
    const provider = resolveProviderForProfile(profile);
    return {
      ...profile,
      provider: provider.id,
      providerLabel: provider.label,
      model: provider.model,
      url: profile.provider === "custom" ? profile.url : provider.endpoint,
    };
  }

  function saveApiConfig(config) {
    const current = getApiProfileConfig();
    current.primary = normalizeApiProfile(config);
    current.viewApiMap[VIEW_IDOL] = "primary";
    return saveApiProfileConfig(current);
  }

  function getContextCount() {
    try {
      const value = Number(localStorage.getItem(STORAGE_KEYS.CONTEXT_COUNT));
      return Number.isFinite(value) && value >= 0 ? value : 3;
    } catch (_error) {
      return 3;
    }
  }

  function saveContextCount(count) {
    try {
      const value = Math.max(0, Number(count) || 0);
      localStorage.setItem(STORAGE_KEYS.CONTEXT_COUNT, String(value));
      return true;
    } catch (error) {
      console.error("[Idol API] Failed to save context count:", error);
      return false;
    }
  }

  function getDefaultPresets() {
    return {
      contracts: {
        name: "通告生成",
        system:
          "你是偶像养成系统的通告生成器。请根据当前剧情、成员属性和公司状态，生成适合偶像团体的通告列表。必须只输出 <contracts>...</contracts> 标签内容，不要前言。",
        userPrompt:
          "请生成 10 条通告。每条包含：通告名、类型、主办方、报酬、周期、截止日期、推荐属性、风险或备注。直接输出 <contracts> 标签。",
      },
      shop: {
        name: "商品刷新",
        system:
          "你是偶像养成系统的商品刷新器。请生成适合经纪公司采购、训练、宣传、生活和舞台使用的商品。必须只输出 <shop>...</shop> 标签内容，不要前言。",
        userPrompt:
          "请生成 8-12 个商品。每个商品包含：名称、分类、价格、效果、稀有度或备注。直接输出 <shop> 标签。",
      },
      news: {
        name: "日报生成",
        system:
          "你是偶像养成系统的娱乐新闻编辑。请根据当前剧情生成今日娱乐圈日报。必须只输出 <news>...</news> 标签内容，不要前言。",
        userPrompt:
          "请生成 5 条娱乐新闻，覆盖热搜、业内、粉丝、竞争对手或公司动态。直接输出 <news> 标签。",
      },
    };
  }

  function getPresets() {
    const defaults = getDefaultPresets();
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.PRESETS);
      if (!stored) return defaults;
      const parsed = JSON.parse(stored);
      for (const key of Object.keys(defaults)) {
        parsed[key] = {
          ...defaults[key],
          ...(parsed[key] && typeof parsed[key] === "object" ? parsed[key] : {}),
        };
      }
      return parsed;
    } catch (error) {
      console.error("[Idol API] Failed to read presets:", error);
      return defaults;
    }
  }

  function savePresets(presets) {
    try {
      localStorage.setItem(STORAGE_KEYS.PRESETS, JSON.stringify(presets));
      return true;
    } catch (error) {
      console.error("[Idol API] Failed to save presets:", error);
      return false;
    }
  }

  function getChatContext(count) {
    const context = window.SillyTavern ? window.SillyTavern.getContext() : null;
    if (!context || !Array.isArray(context.chat)) return [];

    const startIndex = Math.max(0, context.chat.length - Math.max(0, Number(count) || 0));
    return context.chat.slice(startIndex).filter((msg) => msg?.mes).map((msg) => ({
      role: msg.is_user ? "user" : "assistant",
      content: msg.mes,
    }));
  }

  function setDynamicUserPrompt(type, prompt) {
    dynamicUserPrompts[type] = prompt;
  }

  function abortCurrentRequest() {
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
  }

  function hasUsableProfile(profile) {
    return Boolean(profile?.provider && PROVIDERS[profile.provider] && profile.key && (profile.provider !== "custom" || profile.url));
  }

  function resolveProviderForProfile(profile) {
    const provider = PROVIDERS[normalizeProviderId(profile?.provider)] || PROVIDERS.openai;
    return {
      ...provider,
      model: normalizeModelId(provider.id, profile?.model),
      endpoint: provider.id === "custom" ? normalizeChatCompletionsUrl(profile.url) : provider.endpoint,
    };
  }

  function normalizeChatCompletionsUrl(baseUrl) {
    const trimmed = `${baseUrl || ""}`.trim().replace(/\/+$/, "");
    if (!trimmed) return "";
    if (trimmed.endsWith("/chat/completions")) return trimmed;
    if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
    if (!trimmed.includes("/v1")) return `${trimmed}/v1/chat/completions`;
    return `${trimmed}/chat/completions`;
  }

  const extractSystemText = (messages) =>
    messages.filter((message) => message.role === "system").map((message) => `${message.content || ""}`.trim()).filter(Boolean).join("\n\n");

  const nonSystemMessages = (messages) =>
    messages.filter((message) => message.role !== "system").map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: `${message.content || ""}`.trim(),
    })).filter((message) => message.content);

  const composeSinglePrompt = (messages) => {
    const systemText = extractSystemText(messages);
    const conversationText = nonSystemMessages(messages)
      .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}:\n${message.content}`)
      .join("\n\n");
    return [systemText ? `System:\n${systemText}` : "", conversationText].filter(Boolean).join("\n\n");
  };

  function createOpenAiRequest(provider, profile, messages) {
    const systemText = extractSystemText(messages);
    const body = {
      model: provider.model,
      input: nonSystemMessages(messages),
      temperature: profile.temperature,
      max_output_tokens: profile.max_tokens,
    };
    if (systemText) body.instructions = systemText;
    if (!body.input.length) body.input = composeSinglePrompt(messages);

    return {
      url: provider.endpoint,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${profile.key}`,
        },
        body: JSON.stringify(body),
      },
    };
  }

  function createChatCompletionsRequest(provider, profile, messages) {
    return {
      url: provider.endpoint,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${profile.key}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: profile.temperature,
          max_tokens: profile.max_tokens,
          stream: false,
        }),
      },
    };
  }

  function createGeminiRequest(provider, profile, messages) {
    const systemText = extractSystemText(messages);
    return {
      url: `${provider.endpoint}/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(profile.key)}`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: nonSystemMessages(messages).map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
          generationConfig: {
            temperature: profile.temperature,
            maxOutputTokens: profile.max_tokens,
          },
        }),
      },
    };
  }

  function createClaudeRequest(provider, profile, messages) {
    const systemText = extractSystemText(messages);
    const body = {
      model: provider.model,
      max_tokens: provider.maxTokens || profile.max_tokens,
      temperature: profile.temperature,
      messages: nonSystemMessages(messages),
    };
    if (systemText) body.system = systemText;
    return {
      url: provider.endpoint,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": profile.key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      },
    };
  }

  function createMiniMaxRequest(provider, profile, messages) {
    return {
      url: provider.endpoint,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${profile.key}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: profile.temperature,
          max_tokens: provider.maxTokens || profile.max_tokens,
          stream: false,
        }),
      },
    };
  }

  function createRequest(profile, messages) {
    const provider = resolveProviderForProfile(profile);
    if (provider.id === "openai") return createOpenAiRequest(provider, profile, messages);
    if (provider.id === "gemini") return createGeminiRequest(provider, profile, messages);
    if (provider.id === "claude") return createClaudeRequest(provider, profile, messages);
    if (provider.id === "minimax") return createMiniMaxRequest(provider, profile, messages);
    return createChatCompletionsRequest(provider, profile, messages);
  }

  async function parseResponse(response, providerId) {
    const data = await response.json();
    if (providerId === "openai") {
      if (typeof data.output_text === "string") return data.output_text;
      const text = data.output?.flatMap((item) => item.content || []).map((part) => part.text || part.content || "").join("");
      if (text) return text;
    }
    if (providerId === "gemini") {
      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
      if (text) return text;
    }
    if (providerId === "claude") {
      const text = data.content?.map((part) => part.text || "").join("");
      if (text) return text;
    }
    const chatText = data.choices?.[0]?.message?.content || data.message?.content || data.response;
    if (chatText) return chatText;
    throw new Error("API response did not contain text content.");
  }

  async function callAiApi(type) {
    const profile = loadApiConfigForView(VIEW_IDOL);
    if (!hasUsableProfile(profile)) {
      return { success: false, error: "请先在插件设置里填写可用的独立 API 配置。" };
    }

    const presets = getPresets();
    const preset = presets[type];
    if (!preset?.system) {
      return { success: false, error: `请先配置 ${preset?.name || type} 的 System Prompt。` };
    }

    const messages = [
      { role: "system", content: preset.system },
      ...getChatContext(getContextCount()),
    ];

    const userPrompt = dynamicUserPrompts[type] || preset.userPrompt;
    if (userPrompt) messages.push({ role: "user", content: userPrompt });
    delete dynamicUserPrompts[type];

    activeController = new AbortController();
    try {
      const request = createRequest(profile, messages);
      request.init.signal = activeController.signal;
      const response = await fetch(request.url, request.init);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${errorText}`);
      }
      const content = await parseResponse(response, profile.provider);
      return { success: true, content, type };
    } catch (error) {
      if (error.name === "AbortError") return { success: false, error: "请求已取消。" };
      console.error("[Idol API] API request failed:", error);
      return { success: false, error: error.message || "未知 API 错误" };
    } finally {
      activeController = null;
    }
  }

  window.IdolApiService = {
    getProviderDefinitions,
    getApiProfileConfig,
    saveApiProfileConfig,
    loadApiConfigForView,
    getApiConfig,
    saveApiConfig,
    getContextCount,
    saveContextCount,
    getPresets,
    savePresets,
    getChatContext,
    setDynamicUserPrompt,
    callAiApi,
    abortCurrentRequest,
  };

  console.info("[Idol API Service] ST_Music-style API runtime loaded.");
})();
