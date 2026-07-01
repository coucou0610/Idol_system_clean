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
        name: "通告生成预设",
        system: '当用户请求生成通告时，请严格按以下格式和等级规则生成通告列表。\n【通告等级规则】\n- 50-60为新人基础通告，适合杂志内页、小品牌拍摄、伴舞、网剧小配角、OST试唱等；报酬约5,000-50,000 CNY。\n- 60-70为上升期通告，适合二线品牌广告、杂志专题、网剧女三/女四、综艺小单元、音乐节拼盘等；报酬约50,000-150,000 CNY。\n- 70-80为热度资源通告，适合知名品牌广告、热门OST、网剧女二、电视剧重要配角、综艺常驻等；报酬约150,000-500,000 CNY。\n- 80-90为核心商业通告；报酬约500,000-2,000,000 CNY。\n- 90-100为顶级战略通告；报酬约2,000,000 CNY以上。\n- 属性要求应与等级匹配，不相关属性用"-"表示。\n- 报酬必须与等级、曝光度、工作周期匹配，不得随意过高。\n【生成规则】\n每次生成恰好10条通告，五种类别各1-2条。\n必须在整个列表开头和结尾使用 <contracts> 和 </contracts> 标签包裹。\n每条通告用方括号 [] 包裹，用全角竖线｜分隔字段，共10个字段，顺序固定不可更换。\n所有项目名、公司、剧情必须完全原创，禁止重复历史内容。\n唱片类通告中，万城娱乐为主角定制的唱片录制必须偶尔出现（约每3次生成1次），酬劳写"无额外酬劳（公司分成）"。\n参考聊天上下文中的最新剧情，若剧情中出现特定机会（如试镜、人脉引荐、突发邀约等），优先生成与剧情相关的通告。\n【数据格式】\n<contracts>\n[通告｜通告类别｜项目名｜公司｜工作性质｜属性要求｜酬劳｜拍摄周期｜截止日期｜内容说明]\n</contracts>\n【字段说明】\n通告类别：电影电视剧 / Movie & TV series、唱片 / Music、舞台 / Stage、综艺 / Variety show、广告 / Ad\n工作性质：舞台类用主打歌首秀/Special Stage/开场嘉宾/压轴嘉宾；其他类用主角/配角/品牌代言人/广告模特/常驻MC等\n属性：歌艺，舞蹈，演技，魅力，气质，体能，不需要的用-，格式示例：歌艺55，舞蹈58，魅力55，气质-，体能52，演技-\n酬劳：金额+空格+CNY，例如：30,000 CNY。特殊情况：万城娱乐为主角定制的唱片录制为义务工作，酬劳写"无额外酬劳（公司分成）"。\n内容说明：200字以内。影视类需含剧情大纲（开头/过程/结尾）；其他类写工作类型和要求。\n【示例】\n[通告｜舞台 / Stage｜《音浪前线》打歌舞台｜PSTV电视台｜主打歌首秀｜歌艺55，舞蹈58，魅力55，气质-，体能52，演技-｜30,000 CNY｜1天｜2026年9月10日｜工作类型：打歌节目首秀。要求：提前一天彩排，正装出席，妆造由台方负责。]\n',
        userPrompt: "请严格按格式生成通告列表，每条必须包含全部10个字段（含截止日期和内容说明），内容说明控制在50字以内，直接输出<contracts>标签，不要任何前言。",
      },
      shop: {
        name: "商店生成预设",
        system: '当用户请求"浏览商店"、"查看商品"、"刷新购物车"、"购买物品"、"预定行程"或剧情推进到需要为宿舍/个人/团队添置物品及规划资金使用时，请严格按照以下格式生成商品列表。\n\n生成规则：每次生成必须包含4-12个精选商品，商品类型应多样化或根据当前剧情上下文（如"采购设备"、"计划休假"、"遭遇公关危机"、"奢侈品"、"礼物"）侧重生成。\n必须在整个列表的开头和结尾使用 <shop> 和 </shop> 标签包裹。\n内部每条商品必须使用方括号 [] 包裹，并严格使用全角竖线 ｜ 分隔字段。\n内容需符合当前{{user}}咖位的消费水平及"偶像模拟经营"的游戏性，并与{{user}}需求及世界观设定紧密挂钩。\n\n数据格式\n<shop> [商品｜商品类别｜物品名称｜品牌/来源｜物品描述｜适用对象/效果｜价格｜库存] ... </shop>\n\n字段说明\n商品类别（严格限制为以下12类）：\n时尚 Fashion：高定服装、珠宝、名表。\n设备 Gear：顶级乐器、录音设备、电竞外设。\n家居 Home：宿舍软装、家电、宠物用品。\n饮食 Food：顶级食材、补剂、酒水。\n礼物 Gift：稀有收藏品、节日礼物。\n旅游 Travel：度假套餐、团建露营。\n营销 PR：买热搜、地标大屏、危机公关。\n团队 Staff：私厨、保镖、专属跟拍。\n粉丝 Fan：咖啡车、逆应援礼包。\n投资 Invest：房产、股票、理财。\n载具 Auto：保姆车、超跑。\n\n物品名称、品牌/来源、物品描述、适用对象/效果、价格（500-500,000 CNY）、库存（现货/仅剩1件/需预定/限量版/内部渠道）。\n\n输出示例：\n<shop>\n[商品｜时尚 Fashion｜2025春夏限定风衣｜Bottega Veneta｜无logo设计，皮质细腻，剪裁极简｜显著提升"魅力"与"气质"｜38,000 CNY｜需预定]\n[商品｜营销 PR｜个人负面热搜公关套餐｜万城公关部｜撤热搜、净化词条、安排正面通稿｜口碑度上升，知名度少量上升｜300,000 CNY｜紧急服务]\n[商品｜课程 Edu｜高端健身私教月卡｜Pure Fitness｜一对一增肌/塑形指导｜"体能"和"气质"稳步提升｜8,800 CNY/月｜现货]\n</shop>',
        userPrompt: "请生成当前商店的商品列表",
      },
      news: {
        name: "日报生成预设",
        system: '当用户请求"查看新闻"、"刷微博"、"看热搜"、"看日报"时，请严格按照以下格式生成今日的娱乐新闻列表。\n\n生成规则：\n每次生成必须恰好包含 5 条新闻，类型分配严格如下：头条 Headline 必须恰好 1 条且类型字段必须写"头条 Headline"，热搜 Trending 1-2 条，竞品 Rivalry 恰好 1 条，八卦 Gossip 恰好 1 条，行业 Industry 恰好 1 条。禁止将热搜类型用作头条。\n内容必须混合 正面战报（{{user}}相关）、负面/争议八卦、行业动态及社会热点。\n必须在整个列表的开头和结尾使用 <news> 和 </news> 标签包裹。\n内部每条新闻必须使用方括号 [] 包裹，并严格使用全角竖线 ｜ 分隔字段。\n\n数据格式：\n<news>\n[类型｜热度排名｜标题/话题｜来源｜内容摘要｜对艺人的影响]\n...\n</news>\n\n字段说明\n类型：头条 Headline / 热搜 Trending / 八卦 Gossip / 竞品 Rivalry / 行业 Industry\n热度排名：爆、热、NO.1、NO.5、新、推荐\n标题/话题：热搜类型需带#号\n来源：官方公告、京港第一狗仔、营销号、VOGUE官博等\n内容摘要：一句话描述新闻详情\n对艺人的影响：简述对{{user}}或公司的数值/剧情影响\n\n输出示例：\n<news>\n[头条｜爆｜{{user}}签约万城娱乐 正式成为旗下练习生｜万城娱乐官方｜万城娱乐今日宣布，新人{{user}}正式签约，将接受封闭训练。｜知名度大幅提升，解锁"练习生日常"系列剧情]\n[热搜｜NO.1｜#{{user}} 机场生图#｜微博娱乐榜｜{{user}}现身京港机场被路人拍到，素颜引发热议。｜{{user}}个人魅力值+5]\n[竞品｜NO.3｜星河娱乐新男团"极光少年"出道舞台破百万｜星河娱乐官网｜五人男团出道曲MV上线4小时播放量破百万。｜同行竞争压力上升]\n</news>',
        userPrompt: "直接输出<news>标签，生成今日5条娱乐新闻，禁止开场白。",
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
