/**
 * HADES API bridge.
 * Publicly exposes window.HadesApiBridge for the UI, while keeping the runtime
 * implementation independent from the original CTE Map API module.
 */
(function () {
  "use strict";

  const VIEW_KEY = "hades";
  const STORE = Object.freeze({
    profiles: "hades_atelier_api_profiles",
    presets: "hades_atelier_prompt_presets",
    context: "hades_atelier_context_window",
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
    openai: {
      label: "OpenAI",
      needsUrl: true,
      models: [{ value: "gpt-5.4-mini" }, { value: "gpt-5.4" }, { value: "gpt-5.4-nano" }, { value: "gpt-4o" }, { value: "gpt-4o-mini" }],
    },
    chatgpt: {
      label: "ChatGPT",
      models: [{ value: "gpt-5.4-mini" }, { value: "gpt-5.4" }, { value: "gpt-5.4-nano" }, { value: "gpt-4o" }, { value: "gpt-4o-mini" }],
    },
    gemini: {
      label: "Gemini",
      models: [{ value: "gemini-3.5-flash" }, { value: "gemini-3.1-flash-lite" }, { value: "gemini-2.5-flash" }, { value: "gemini-2.5-flash-lite" }, { value: "gemini-2.5-pro" }],
    },
    claude: {
      label: "Claude",
      models: [{ value: "claude-fable-5" }, { value: "claude-opus-4-8" }, { value: "claude-sonnet-5" }, { value: "claude-haiku-4-5" }],
    },
    deepseek: {
      label: "DeepSeek",
      models: [{ value: "deepseek-v4-flash" }, { value: "deepseek-v4-pro" }, { value: "deepseek-chat" }, { value: "deepseek-reasoner" }],
    },
    minimax: { label: "MiniMax", models: [{ value: "MiniMax-M3" }, { value: "MiniMax-M2.7" }, { value: "M2.7-highspeed" }, { value: "MiniMax-M2.5" }, { value: "M2.5-highspeed" }] },
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
      return blankConfig();
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
    system: "当用户请求生成通告时，请严格按以下格式和等级规则生成通告列表。\n【通告等级规则】\n- 50-60为新人基础通告，适合杂志内页、小品牌拍摄、伴舞、网剧小配角、OST试唱等；报酬约5,000-50,000 CNY。\n- 60-70为上升期通告，适合二线品牌广告、杂志专题、网剧女三/女四、综艺小单元、音乐节拼盘等；报酬约50,000-150,000 CNY。\n- 70-80为热度资源通告，适合知名品牌广告、热门OST、网剧女二、电视剧重要配角、综艺常驻等；报酬约150,000-500,000 CNY。\n- 80-90为核心商业通告；报酬约500,000-2,000,000 CNY。\n- 90-100为顶级战略通告；报酬约2,000,000 CNY以上。\n- 属性要求应与等级匹配，不相关属性用\"-\"表示。\n- 报酬必须与等级、曝光度、工作周期匹配，不得随意过高。\n【生成规则】\n每次生成恰好10条通告，五种类别各1-2条。\n必须在整个列表开头和结尾使用 <contracts> 和 </contracts> 标签包裹。\n每条通告用方括号 [] 包裹，用全角竖线｜分隔字段，共10个字段，顺序固定不可更换。\n所有项目名、公司、剧情必须完全原创，禁止重复历史内容。\n唱片类通告中，万城娱乐为主角定制的唱片录制必须偶尔出现（约每3次生成1次），酬劳写\"无额外酬劳（公司分成）\"。\n参考聊天上下文中的最新剧情，若剧情中出现特定机会（如试镜、人脉引荐、突发邀约等），优先生成与剧情相关的通告。\n【数据格式】\n<contracts>\n[通告｜通告类别｜项目名｜公司｜工作性质｜属性要求｜酬劳｜拍摄周期｜截止日期｜内容说明]\n</contracts>\n【字段说明】\n通告类别：电影电视剧 / Movie & TV series、唱片 / Music、舞台 / Stage、综艺 / Variety show、广告 / Ad\n工作性质：舞台类用主打歌首秀/Special Stage/开场嘉宾/压轴嘉宾；其他类用主角/配角/品牌代言人/广告模特/常驻MC等\n属性：歌艺，舞蹈，演技，魅力，气质，体能，不需要的用-，格式示例：歌艺55，舞蹈58，魅力55，气质-，体能52，演技-\n酬劳：金额+空格+CNY，例如：30,000 CNY。特殊情况：万城娱乐为主角定制的唱片录制为义务工作，酬劳写\"无额外酬劳（公司分成）\"。\n内容说明：200字以内。影视类需含剧情大纲（开头/过程/结尾）；其他类写工作类型和要求。\n【示例】\n[通告｜舞台 / Stage｜《音浪前线》打歌舞台｜PSTV电视台｜主打歌首秀｜歌艺55，舞蹈58，魅力55，气质-，体能52，演技-｜30,000 CNY｜1天｜2026年9月10日｜工作类型：打歌节目首秀。要求：提前一天彩排，正装出席，妆造由台方负责。]\n",
    userPrompt: "请严格按格式生成通告列表，每条必须包含全部10个字段（含截止日期和内容说明），内容说明控制在50字以内，直接输出<contracts>标签，不要任何前言。"
  },
  shop: {
    name: "商店生成预设",
    system: "当用户请求\"浏览商店\"、\"查看商品\"、\"刷新购物车\"、\"购买物品\"、\"预定行程\"或剧情推进到需要为宿舍/个人/团队添置物品及规划资金使用时，请严格按照以下格式生成商品列表。\n\n生成规则：每次生成必须包含4-12个精选商品，商品类型应多样化或根据当前剧情上下文（如\"采购设备\"、\"计划休假\"、\"遭遇公关危机\"、\"奢侈品\"、\"礼物\"）侧重生成。\n必须在整个列表的开头和结尾使用 <shop> 和 </shop> 标签包裹。\n内部每条商品必须使用方括号 [] 包裹，并严格使用全角竖线 ｜ 分隔字段。\n内容需符合当前{{user}}咖位的消费水平及\"偶像模拟经营\"的游戏性，并与{{user}}需求及世界观设定紧密挂钩。\n\n数据格式\n<shop> [商品｜商品类别｜物品名称｜品牌/来源｜物品描述｜适用对象/效果｜价格｜库存] ... </shop>\n\n字段说明\n商品类别（严格限制为以下12类）：\n时尚 Fashion：高定服装、珠宝、名表。\n设备 Gear：顶级乐器、录音设备、电竞外设。\n家居 Home：宿舍软装、家电、宠物用品。\n饮食 Food：顶级食材、补剂、酒水。\n礼物 Gift：稀有收藏品、节日礼物。\n旅游 Travel：度假套餐、团建露营。\n营销 PR：买热搜、地标大屏、危机公关。\n团队 Staff：私厨、保镖、专属跟拍。\n粉丝 Fan：咖啡车、逆应援礼包。\n投资 Invest：房产、股票、理财。\n载具 Auto：保姆车、超跑。\n\n物品名称、品牌/来源、物品描述、适用对象/效果、价格（500-500,000 CNY）、库存（现货/仅剩1件/需预定/限量版/内部渠道）。\n\n输出示例：\n<shop>\n[商品｜时尚 Fashion｜2025春夏限定风衣｜Bottega Veneta｜无logo设计，皮质细腻，剪裁极简｜显著提升\"魅力\"与\"气质\"｜38,000 CNY｜需预定]\n[商品｜营销 PR｜个人负面热搜公关套餐｜万城公关部｜撤热搜、净化词条、安排正面通稿｜口碑度上升，知名度少量上升｜300,000 CNY｜紧急服务]\n[商品｜课程 Edu｜高端健身私教月卡｜Pure Fitness｜一对一增肌/塑形指导｜\"体能\"和\"气质\"稳步提升｜8,800 CNY/月｜现货]\n</shop>",
    userPrompt: "请生成当前商店的商品列表"
  },
  news: {
    name: "日报生成预设",
    system: "当用户请求\"查看新闻\"、\"刷微博\"、\"看热搜\"、\"看日报\"时，请严格按照以下格式生成今日的娱乐新闻列表。\n\n生成规则：\n每次生成必须恰好包含 5 条新闻，类型分配严格如下：头条 Headline 必须恰好 1 条且类型字段必须写\"头条 Headline\"，热搜 Trending 1-2 条，竞品 Rivalry 恰好 1 条，八卦 Gossip 恰好 1 条，行业 Industry 恰好 1 条。禁止将热搜类型用作头条。\n内容必须混合 正面战报（{{user}}相关）、负面/争议八卦、行业动态及社会热点。\n必须在整个列表的开头和结尾使用 <news> 和 </news> 标签包裹。\n内部每条新闻必须使用方括号 [] 包裹，并严格使用全角竖线 ｜ 分隔字段。\n\n数据格式：\n<news>\n[类型｜热度排名｜标题/话题｜来源｜内容摘要｜对艺人的影响]\n...\n</news>\n\n字段说明\n类型：头条 Headline / 热搜 Trending / 八卦 Gossip / 竞品 Rivalry / 行业 Industry\n热度排名：爆、热、NO.1、NO.5、新、推荐\n标题/话题：热搜类型需带#号\n来源：官方公告、京港第一狗仔、营销号、VOGUE官博等\n内容摘要：一句话描述新闻详情\n对艺人的影响：简述对{{user}}或公司的数值/剧情影响\n\n输出示例：\n<news>\n[头条｜爆｜{{user}}签约万城娱乐 正式成为旗下练习生｜万城娱乐官方｜万城娱乐今日宣布，新人{{user}}正式签约，将接受封闭训练。｜知名度大幅提升，解锁\"练习生日常\"系列剧情]\n[热搜｜NO.1｜#{{user}} 机场生图#｜微博娱乐榜｜{{user}}现身京港机场被路人拍到，素颜引发热议。｜{{user}}个人魅力值+5]\n[竞品｜NO.3｜星河娱乐新男团\"极光少年\"出道舞台破百万｜星河娱乐官网｜五人男团出道曲MV上线4小时播放量破百万。｜同行竞争压力上升]\n</news>",
    userPrompt: "直接输出<news>标签，生成今日5条娱乐新闻，禁止开场白。"
  }
});

  const stripNewsGuide = (text) => String(text || "").replace(/\n*\s*【日报事实约束与NPC简档】[\s\S]*$/m, "").trim();

  const withNewsGuide = (systemText) => {
    const base = stripNewsGuide(systemText);
    return `${base}\n\n${newsGuide}`.trim();
  };

  const presetBook = () => {
    const defaults = defaultPresets();
    const stored = readStore(STORE.presets, {});
    const book = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    for (const key of Object.keys(defaults)) {
      book[key] = { ...defaults[key], ...(book[key] || {}) };
    }
    if (book.news) book.news.system = withNewsGuide(book.news.system);
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
    if (profile.provider === "chatgpt") return "https://api.openai.com/v1/chat/completions";
    if (profile.provider === "deepseek") return "https://api.deepseek.com/chat/completions";
    if (profile.provider === "claude") return "https://api.anthropic.com/v1/messages";
    if (profile.provider === "minimax") return "https://api.minimax.io/v1/chat/completions";
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
      headers["anthropic-dangerous-direct-browser-access"] = "true";
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
    if (profile.provider === "openai") return Boolean(profile.url && profile.key && profile.model);
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
      console.error("[HadesApiBridge] request failed:", error);
      return { success: false, error: error?.message || "未知 API 错误" };
    } finally {
      requestHandle = null;
    }
  };

  window.HadesApiBridge = {
    listHadesProviders: () => providers,
    readHadesProfiles: readProfiles,
    writeHadesProfiles: saveProfiles,
    selectHadesProfile: profileForView,
    readHadesApiProfile: getSingleProfile,
    persistHadesApiProfile: saveSingleProfile,
    getHadesContextLimit: contextLimit,
    setHadesContextLimit: updateContextLimit,
    readHadesPresets: presetBook,
    writeHadesPresets: savePresetBook,
    collectHadesContext: recentDialogue,
    setHadesPromptOverride: overrideNextPrompt,
    runHadesGeneration: runGeneration,
    abortHadesGeneration: cancelActive,
  };

  console.info("[HadesApiBridge] independent API bridge loaded.");
})();



