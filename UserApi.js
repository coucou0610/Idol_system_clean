/**
 * Idol System API bridge.
 * Publicly exposes window.IdolApiService for the UI, while keeping the runtime
 * implementation independent from the original CTE Map API module.
 */
(function () {
  "use strict";

  const VIEW_KEY = "idol";
  const STORE = Object.freeze({
    profiles: "idol_system_api_profiles",
    presets: "idol_system_prompt_presets",
    context: "idol_system_context_window",
  });

  const profileTemplate = Object.freeze({
    provider: "custom",
    url: "",
    key: "",
    model: "",
    temperature: 0.8,
    max_tokens: 4000,
  });

  const providers = Object.freeze({
    sillytavern: { label: "使用酒馆主 API", models: [{ value: "", label: "使用当前酒馆模型" }] },
    custom: { label: "OpenAI Compatible", models: [{ value: "", label: "手动填写模型" }] },
    openai: { label: "OpenAI", models: [{ value: "gpt-4o-mini" }, { value: "gpt-4o" }, { value: "gpt-4.1-mini" }] },
    gemini: { label: "Gemini", models: [{ value: "gemini-2.5-flash" }, { value: "gemini-2.5-pro" }] },
    claude: { label: "Claude", models: [{ value: "claude-3-5-sonnet-latest" }, { value: "claude-3-5-haiku-latest" }] },
    deepseek: { label: "DeepSeek", models: [{ value: "deepseek-chat" }, { value: "deepseek-reasoner" }] },
  });

  let requestHandle = null;
  const oneShotPrompts = Object.create(null);

  const safeParse = (text, fallback) => {
    try {
      return text ? JSON.parse(text) : fallback;
    } catch (_error) {
      return fallback;
    }
  };

  const readStore = (key, fallback) => safeParse(localStorage.getItem(key), fallback);

  const writeStore = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  };

  const normalizeProfile = (input = {}) => {
    const merged = { ...profileTemplate, ...input };
    const provider = providers[merged.provider] ? merged.provider : (merged.provider === "sillytavern" ? "sillytavern" : "custom");
    return {
      provider,
      url: String(merged.url || "").trim(),
      key: String(merged.key || "").trim(),
      model: String(merged.model || "").trim(),
      temperature: Number.isFinite(Number(merged.temperature)) ? Number(merged.temperature) : 0.8,
      max_tokens: Number.isFinite(Number(merged.max_tokens)) ? Number(merged.max_tokens) : 4000,
    };
  };

  const blankConfig = () => ({
    version: 5,
    enableSecondApi: false,
    primary: { ...profileTemplate },
    secondary: { ...profileTemplate },
    viewApiMap: { [VIEW_KEY]: "primary" },
  });

  const readProfiles = () => {
    const raw = readStore(STORE.profiles, null);
    if (!raw) {
      const oldSingle = readStore("idol_api_config", null);
      const migrated = blankConfig();
      if (oldSingle) migrated.primary = normalizeProfile(oldSingle);
      return migrated;
    }

    const next = { ...blankConfig(), ...raw };
    next.primary = normalizeProfile(next.primary);
    next.secondary = normalizeProfile(next.secondary);
    next.viewApiMap = { [VIEW_KEY]: "primary", ...(next.viewApiMap || {}) };
    return next;
  };

  const saveProfiles = (config) => {
    const next = { ...blankConfig(), ...(config || {}) };
    next.primary = normalizeProfile(next.primary);
    next.secondary = normalizeProfile(next.secondary);
    next.viewApiMap = { [VIEW_KEY]: "primary", ...(next.viewApiMap || {}) };
    return writeStore(STORE.profiles, next);
  };

  const profileForView = (viewName = VIEW_KEY) => {
    const config = readProfiles();
    const slot = config.viewApiMap?.[viewName] || "primary";
    return normalizeProfile(config[slot] || config.primary);
  };

  const getSingleProfile = () => profileForView(VIEW_KEY);

  const saveSingleProfile = (profile) => {
    const config = readProfiles();
    config.primary = normalizeProfile(profile);
    config.viewApiMap = { ...(config.viewApiMap || {}), [VIEW_KEY]: "primary" };
    return saveProfiles(config);
  };

  const contextLimit = () => {
    const saved = Number(localStorage.getItem(STORE.context));
    return Number.isFinite(saved) && saved >= 8 ? saved : 8;
  };

  const updateContextLimit = (count) => {
    localStorage.setItem(STORE.context, String(Math.max(8, Number(count) || 8)));
    return true;
  };

  const newsGuide = `
【日报事实约束与NPC简档】
1. {{user}}相关信息必须以最近8条聊天、<status_bar>、已接通告、7日行程表、代表作品、已购买商品和已发生剧情为依据。
2. 不要为{{user}}补写固定人设，不要把签约、选秀、solo出道、欠培训费等初始背景当作今日新闻。
3. 没有明确作品名或通告名时，用“近期舞台”“新通告”“训练近况”等模糊表述，不编造具体成果。
4. NPC只作为轻量世界观参考，不得改变身份、公司、年龄段、关系和核心性格。
5. 万城主要人物：魏月华/Moon，万城CEO，冷静严格；秦述/Shaw，金牌经纪人，可靠克制；司洛/SOLO，顶流ACE，舞台感强；鹿言/Deer，形体指导兼营养师，温柔稳定；魏星泽，神级站哥，阳光真诚；周锦宁，豪门继承人，傲娇毒舌；谌绪/Chase，养成系顶流，乖巧腹黑；孟明赫/Hades，音乐制作人，阴郁专注；亓谢/Knife，造型总监，毒舌审美锋利；桑洛凡/Lovan，影帝，张扬腹黑。
6. 其他NPC可作行业新闻：沈夜舟、江予行、程砚、许知远、宋时予、陈宿、NOVA、沈听溪、安宁、陆知意、温以宁、苏栀、林颂、STARLIGHT。
7. 示例只用于格式参考，严禁照抄旧示例内容。
`.trim();

  const defaultPresets = () => ({
    contracts: {
      name: "通告生成预设",
      system: [
        "你负责为偶像经营系统生成通告列表。",
        "必须输出<contracts>...</contracts>，不要前言。",
        "每次恰好10条，影视/唱片/舞台/综艺/广告各1-2条。",
        "每条格式：[通告｜通告类别｜项目名｜公司｜工作性质｜属性要求｜酬劳｜拍摄周期｜截止日期｜内容说明]",
        "属性格式示例：歌艺55，舞蹈58，魅力55，气质-，体能52，演技-。",
        "报酬必须符合咖位和工作量；万城定制唱片可写无额外酬劳（公司分成）。",
        "优先参考最近上下文里的试镜、人脉、邀约、已有通告和当前剧情。内容原创，不复用旧项目。",
      ].join("\n"),
      userPrompt: "请严格按格式生成通告列表，直接输出<contracts>标签。",
    },
    shop: {
      name: "商店生成预设",
      system: [
        "你负责生成偶像经营系统的采购商品。",
        "必须输出<shop>...</shop>，不要前言。",
        "每次生成4-12件商品，类型可含时尚、设备、家居、饮食、礼物、旅游、营销、团队、粉丝、投资、载具。",
        "每条格式：[商品｜商品类别｜物品名称｜品牌/来源｜物品描述｜适用对象/效果｜价格｜库存]",
        "商品应贴合当前剧情、资金状况、通告需求、宿舍生活或公关需求。",
      ].join("\n"),
      userPrompt: "请按<shop>格式生成当前商店商品列表。",
    },
    news: {
      name: "日报生成预设",
      system: [
        "你负责生成京港娱乐日报。",
        "必须输出<news>...</news>，不要前言。",
        "每次恰好5条：头条Headline 1条、热搜Trending 1-2条、竞品Rivalry 1条、八卦Gossip 1条、行业Industry 1条。",
        "每条格式：[类型｜热度排名｜标题/话题｜来源｜内容摘要｜对艺人的影响]",
        "内容应混合{{user}}相关近况、竞品动态、行业资讯和娱乐八卦。",
        newsGuide,
      ].join("\n"),
      userPrompt: "直接输出<news>标签，生成今日5条娱乐新闻。",
    },
  });

  const stripOldNewsBlock = (text) => String(text || "").replace(/【日报NPC与事实约束】[\s\S]*$/m, "").trim();

  const withNewsRules = (systemText) => {
    const base = stripOldNewsBlock(systemText);
    return `${base}\n\n${newsGuide}`.trim();
  };

  const presetBook = () => {
    const defaults = defaultPresets();
    const stored = readStore(STORE.presets, {});
    const book = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    for (const key of Object.keys(defaults)) {
      book[key] = { ...defaults[key], ...(book[key] || {}) };
    }
    if (book.news) book.news.system = withNewsRules(book.news.system);
    return book;
  };

  const savePresetBook = (presets) => writeStore(STORE.presets, presets || {});

  const recentDialogue = (count = contextLimit()) => {
    const st = window.SillyTavern?.getContext?.();
    const chat = Array.isArray(st?.chat) ? st.chat : [];
    return chat
      .slice(Math.max(0, chat.length - Math.max(0, Number(count) || 0)))
      .filter((entry) => entry && entry.mes)
      .map((entry) => ({
        role: entry.is_user ? "user" : "assistant",
        content: String(entry.mes),
      }));
  };

  const overrideNextPrompt = (type, prompt) => {
    oneShotPrompts[type] = String(prompt || "");
  };

  const cancelActive = () => {
    requestHandle?.abort?.();
    requestHandle = null;
  };

  const composePlainPrompt = (messages) =>
    messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`).join("\n\n");

  const normalizeText = (value) => {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join("\n").trim();
    if (value && typeof value === "object") {
      return normalizeText(value.content || value.text || value.message || value.response || value.output_text);
    }
    return "";
  };

  const callTavern = async (messages) => {
    const st = window.SillyTavern?.getContext?.();
    if (!st) throw new Error("无法读取 SillyTavern 主 API 上下文。");
    const prompt = composePlainPrompt(messages);
    const candidates = [];
    if (typeof st.generateRaw === "function") {
      candidates.push(() => st.generateRaw(prompt, null, false, true));
      candidates.push(() => st.generateRaw(prompt));
    }
    if (typeof st.generateQuietPrompt === "function") {
      candidates.push(() => st.generateQuietPrompt(prompt, false, false));
      candidates.push(() => st.generateQuietPrompt(prompt));
    }
    if (!candidates.length) throw new Error("当前 SillyTavern 版本没有可用的静默生成接口。");

    let finalError = null;
    for (const run of candidates) {
      try {
        const text = normalizeText(await run());
        if (text) return text;
      } catch (error) {
        finalError = error;
      }
    }
    throw finalError || new Error("酒馆主 API 没有返回文本。");
  };

  const completeEndpoint = (profile) => {
    if (profile.provider === "openai") return "https://api.openai.com/v1/chat/completions";
    if (profile.provider === "deepseek") return "https://api.deepseek.com/chat/completions";
    if (profile.provider === "claude") return "https://api.anthropic.com/v1/messages";
    if (profile.provider === "gemini") {
      const model = encodeURIComponent(profile.model || "gemini-2.5-flash");
      return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(profile.key)}`;
    }

    const url = profile.url.replace(/\/+$/, "");
    if (/\/(chat\/completions|responses|messages)$/i.test(url)) return url;
    if (/\/v\d+$/i.test(url)) return `${url}/chat/completions`;
    return `${url}/v1/chat/completions`;
  };

  const requestPlan = (profile, messages) => {
    const url = completeEndpoint(profile);
    const headers = { "Content-Type": "application/json" };
    let body;

    if (profile.provider === "gemini") {
      body = {
        contents: [{ role: "user", parts: [{ text: composePlainPrompt(messages) }] }],
        generationConfig: { temperature: profile.temperature, maxOutputTokens: profile.max_tokens },
      };
    } else if (profile.provider === "claude") {
      headers["x-api-key"] = profile.key;
      headers["anthropic-version"] = "2023-06-01";
      const system = messages.find((m) => m.role === "system")?.content || "";
      body = {
        model: profile.model || "claude-3-5-sonnet-latest",
        system,
        messages: messages.filter((m) => m.role !== "system"),
        temperature: profile.temperature,
        max_tokens: profile.max_tokens,
      };
    } else {
      if (profile.key) headers.Authorization = `Bearer ${profile.key}`;
      body = {
        model: profile.model,
        messages,
        temperature: profile.temperature,
        max_tokens: profile.max_tokens,
      };
    }

    return { url, init: { method: "POST", headers, body: JSON.stringify(body) } };
  };

  const pullText = async (response, provider) => {
    const data = await response.json();
    if (provider === "gemini") return normalizeText(data.candidates?.[0]?.content?.parts?.map((p) => p.text).join(""));
    if (provider === "claude") return normalizeText(data.content?.map((p) => p.text).join(""));
    return normalizeText(data.choices?.[0]?.message?.content || data.output_text || data.message || data.response);
  };

  const isReady = (profile) => {
    if (profile.provider === "sillytavern") return true;
    if (profile.provider === "gemini") return Boolean(profile.key && profile.model);
    return Boolean(profile.url || profile.provider !== "custom") && Boolean(profile.model) && (profile.provider === "custom" ? Boolean(profile.key || profile.url) : Boolean(profile.key));
  };

  const runGeneration = async (type) => {
    const profile = profileForView(VIEW_KEY);
    if (!isReady(profile)) return { success: false, error: "请先在插件设置中选择酒馆主 API，或填写可用的独立 API 配置。" };

    const presets = presetBook();
    const preset = presets[type];
    if (!preset?.system) return { success: false, error: `缺少 ${type} 的 System Prompt。` };

    const messages = [
      { role: "system", content: preset.system },
      ...recentDialogue(contextLimit()),
    ];
    const prompt = oneShotPrompts[type] || preset.userPrompt;
    if (prompt) messages.push({ role: "user", content: prompt });
    delete oneShotPrompts[type];

    requestHandle = new AbortController();
    try {
      if (profile.provider === "sillytavern") {
        return { success: true, type, content: await callTavern(messages) };
      }
      const plan = requestPlan(profile, messages);
      plan.init.signal = requestHandle.signal;
      const response = await fetch(plan.url, plan.init);
      if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
      const content = await pullText(response, profile.provider);
      if (!content) throw new Error("API 返回为空。");
      return { success: true, type, content };
    } catch (error) {
      if (error?.name === "AbortError") return { success: false, error: "请求已取消。" };
      console.error("[IdolApiService] request failed:", error);
      return { success: false, error: error?.message || "未知 API 错误" };
    } finally {
      requestHandle = null;
    }
  };

  window.IdolApiService = {
    getProviderDefinitions: () => providers,
    getApiProfileConfig: readProfiles,
    saveApiProfileConfig: saveProfiles,
    loadApiConfigForView: profileForView,
    getApiConfig: getSingleProfile,
    saveApiConfig: saveSingleProfile,
    getContextCount: contextLimit,
    saveContextCount: updateContextLimit,
    getPresets: presetBook,
    savePresets: savePresetBook,
    getChatContext: recentDialogue,
    setDynamicUserPrompt: overrideNextPrompt,
    callAiApi: runGeneration,
    abortCurrentRequest: cancelActive,
  };

  window.UserApiService = window.IdolApiService;
  console.info("[IdolApiService] independent API bridge loaded.");
})();
