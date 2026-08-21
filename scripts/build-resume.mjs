import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "src", "resume-data.json");
const GENERATED_NOTICE = "Generated from src/resume-data.json by scripts/build-resume.mjs. Do not edit directly.";
const BASE_URL = "https://jacky-chay.github.io";

const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
const DEFAULT_VARIANT = data.meta?.defaultVariant ?? "backend";

function assert(condition, message) {
  if (!condition) throw new Error(`Resume data validation failed: ${message}`);
}

function text(value, lang = "en") {
  if (typeof value === "string") return value;
  return value?.[lang] ?? "";
}

function walk(value, visitor, trail = "data") {
  visitor(value, trail);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, `${trail}[${index}]`));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => walk(item, visitor, `${trail}.${key}`));
  }
}

function validateCanonicalData() {
  assert(data.meta?.schemaVersion === 1, "unsupported schema version");
  assert(data.profile?.legalName && data.profile?.email && data.profile?.phone && data.profile?.whatsappUrl, "profile identity and contact fields are required");
  assert(/^https:\/\/wa\.me\/\d+$/.test(data.profile.whatsappUrl), "WhatsApp URL must use a wa.me number link");
  assert(data.variants?.backend && data.variants?.fde && data.variants?.hybrid, "backend, fde, and hybrid variants are required");
  assert(data.variants[DEFAULT_VARIANT], `default variant ${DEFAULT_VARIANT} is not defined`);
  assert(data.meta?.artifacts?.activePdfs?.en && data.meta?.artifacts?.activePdfs?.zh, "active English and Chinese PDF artifact names are required");
  const activePdfNames = Object.values(data.meta.artifacts.activePdfs);
  assert(new Set(activePdfNames).size === activePdfNames.length, "active PDF artifact names must be unique");
  const archiveNames = new Set((data.meta.artifacts.archives ?? []).map((archive) => archive.filename));
  activePdfNames.forEach((filename) => assert(!archiveNames.has(filename), `${filename} cannot be both active and archived`));
  for (const variant of Object.values(data.variants)) {
    assert(variant.heroSummary?.en && variant.heroSummary?.zh, "each role variant requires a bilingual hero summary");
  }
  assert(data.meta.translationReview === "pending-native-review" || data.meta.translationReview === "human-reviewed", "translation review state is invalid");

  walk(data, (value, trail) => {
    if (value && typeof value === "object" && !Array.isArray(value) && ("en" in value || "zh" in value)) {
      assert(typeof value.en === "string" && value.en.trim(), `${trail}.en is missing`);
      assert(typeof value.zh === "string" && value.zh.trim(), `${trail}.zh is missing`);
    }
    if (value && typeof value === "object" && value.status === "needs-approval") {
      assert(value.public === false, `${trail} is a public claim marked needs-approval`);
    }
    if (typeof value === "string") {
      assert(!/\[(?:todo|tbd|placeholder|insert|verify|metric|company|customer|name)[^\]]*\]/i.test(value), `${trail} contains a bracketed placeholder`);
      assert(!/\b(?:involved in|helped with|responsible for|hard-working|fast learner|cutting-edge|big project|excellent time management)\b/i.test(value), `${trail} contains banned resume wording`);
    }
  });

  const midea = data.experience.find((item) => item.id === "midea");
  const swisslog = data.experience.find((item) => item.id === "swisslog");
  const netease = data.additionalExperience.find((item) => item.id === "netease");
  const sirius = data.additionalExperience.find((item) => item.id === "sirius");
  assert(midea?.relationship === "direct-employment" && midea.start === "2024-12" && midea.end === "2026-07", "Midea relationship or dates differ from the verified record");
  assert(swisslog?.relationship === "direct-employment" && swisslog.start === "2020-02" && swisslog.end === "2024-12", "Swisslog relationship or dates differ from the verified record");
  assert(netease?.type === "external-kol-partnership" && netease.start === "2022", "NetEase must remain an external/KOL partnership from 2022");
  assert(sirius?.type === "founder" && sirius.start === "2021" && sirius.end === "2024", "Sirius Lab relationship or dates differ from the verified record");

  assert(Array.isArray(data.customerProjects) && data.customerProjects.length === 2, "two verified independent customer projects are required");
  for (const project of data.customerProjects) {
    assert(project.status === "verified" && project.public === true && project.confidential === true, `${project.id} must be a verified, anonymized public summary`);
    assert(project.relationship === "independent-customer-delivery", `${project.id} must remain an independent customer delivery`);
    assert(project.start && project.end && project.title?.en && project.title?.zh, `${project.id} requires dates and bilingual title fields`);
    assert(project.technologies?.includes("Angular") && project.technologies?.includes("React") && project.technologies?.includes("Java EE") && project.technologies?.includes("WildFly") && project.technologies?.includes("PostgreSQL"), `${project.id} is missing its verified technology stack`);
    assert(project.commercialNote?.status === "private-summary", `${project.id} must keep commercial terms private`);
    for (const bullet of project.bullets ?? []) assert(bullet.status === "verified", `${project.id}/${bullet.id} is not verified`);
  }

  for (const claim of [...data.experience, ...data.caseStudies, ...data.additionalExperience, ...data.deliveryCoverage, ...data.education]) {
    assert(claim.status === "verified", `${claim.id ?? claim.credential?.en ?? "claim"} is not verified for public output`);
  }
  for (const role of data.experience) {
    for (const bullet of role.bullets) assert(bullet.status === "verified", `${role.id}/${bullet.id} is not verified`);
  }
  for (const item of data.additionalExperience) {
    for (const bullet of item.bullets) assert(bullet.status === "verified", `${item.id} contains an unverified bullet`);
  }

  for (const entity of data.confidentialEntities ?? []) {
    assert(entity.fallback?.en && entity.fallback?.zh, `${entity.id} requires a bilingual anonymized fallback`);
    if (entity.usePublicName) assert(entity.approved === true && entity.publicName, `${entity.id} selects an unapproved private name`);
  }

  for (const project of data.projects ?? []) {
    const projectText = JSON.stringify(project);
    assert(project.status === "verified" && project.public === true, `${project.id} requires a verified public-safe summary`);
    assert(project.interviewReady === false, `${project.id} must retain its incomplete interview-evidence gate`);
    assert(Array.isArray(project.evidenceNeeded) && project.evidenceNeeded.length >= 5, `${project.id} requires its remaining evidence checklist`);
    assert(/not released/i.test(text(project.stage, "en")), `${project.id} must state that it was not released`);
    assert(project.phases?.some((phase) => phase.kind === "implemented-prototype"), `${project.id} is missing its implemented prototype phase`);
    assert(project.phases?.some((phase) => phase.kind === "planned-not-implemented" && /planned/i.test(text(phase.title, "en"))), `${project.id} must label V2 as planned and not implemented`);
    assert(!/\b(?:production ai|production llm|deployed ai|deployed llm)\b/i.test(projectText), `${project.id} makes a prohibited production-AI claim`);
    assert(!/99\.99%/i.test(projectText), `${project.id} contains an unsupported prevalence metric`);
    assert(/prototype/i.test(text(project.label ?? project.title, "en")), `${project.id} must be explicitly labeled Prototype`);
  }
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function monthYear(value, lang = "en") {
  if (!value) return lang === "zh" ? "至今" : "Present";
  if (/^\d{4}$/.test(value)) return value;
  const [year, month] = value.split("-").map(Number);
  if (lang === "zh") return `${year}年${month}月`;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[month - 1]} ${year}`;
}

function dateRange(item, lang = "en") {
  return `${monthYear(item.start, lang)} - ${monthYear(item.end, lang)}`;
}

function projectDate(item, lang = "en") {
  return item.start === item.end ? monthYear(item.start, lang) : dateRange(item, lang);
}

function publicEntityLabel(entity, lang) {
  if (entity?.usePublicName && entity?.approved) return entity.publicName;
  return text(entity?.fallback, lang);
}

function sortedBullets(role, variant) {
  return role.bullets
    .filter((bullet) => bullet.status === "verified" && bullet.variants.includes(variant))
    .sort((a, b) => (a.priority?.[variant] ?? Number.MAX_SAFE_INTEGER) - (b.priority?.[variant] ?? Number.MAX_SAFE_INTEGER));
}

function renderMetadata({ lang, canonicalPath, title, description, variant = DEFAULT_VARIANT }) {
  const canonical = `${BASE_URL}${canonicalPath}`;
  const profile = data.profile;
  const structured = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.legalName,
    alternateName: "Jacky Chay",
    url: profile.portfolioUrl,
    jobTitle: text(data.variants[variant].title, lang),
    sameAs: [profile.linkedinUrl],
    knowsLanguage: profile.languages.map((language) => text(language.name, "en")),
    address: {
      "@type": "PostalAddress",
      addressCountry: "MY"
    }
  };
  return `
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="author" content="${esc(profile.legalName)}">
  <link rel="canonical" href="${esc(canonical)}">
  <link rel="alternate" hreflang="en" href="${BASE_URL}/">
  <link rel="alternate" hreflang="zh-Hans" href="${BASE_URL}/zh/">
  <link rel="alternate" hreflang="x-default" href="${BASE_URL}/">
  <meta property="og:type" content="profile">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${BASE_URL}/assets/img/og-resume.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Chay Kun Wai - Backend Lead Engineer and Technical Lead">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${BASE_URL}/assets/img/og-resume.png">
  <script type="application/ld+json">${JSON.stringify(structured).replaceAll("<", "\\u003c")}</script>`;
}

const labels = {
  en: {
    skip: "Skip to content",
    nav: "Primary navigation",
    experience: "Experience",
    evidence: "Engineering evidence",
    ai: "AI Prototype",
    strengths: "Skills",
    contact: "Contact",
    currentLanguage: "English",
    languageLabel: "Language",
    eyebrow: "Lead engineering profile",
    availability: "Open to senior engineering and technical leadership positions",
    downloadResume: "Download Resume",
    email: "Email",
    whatsapp: "WhatsApp",
    highlights: "Professional highlights",
    experienceEyebrow: "Professional experience",
    experienceTitle: "Engineering ownership from discovery to operational readiness",
    directEmployee: "Direct employee",
    casesEyebrow: "Engineering delivery evidence",
    casesTitle: "From backend implementation to customer readiness",
    prototypeEyebrow: "Applied AI prototype",
    portraitAlt: "Professional portrait of Chay Kun Wai (Jacky)",
    skillsEyebrow: "Role-relevant skills",
    skillsTitle: "Focused, interview-defensible strengths",
    additionalEyebrow: "Additional experience",
    additionalTitle: "Partnership and independent work",
    customerProjectsEyebrow: "Independent customer projects",
    customerProjectsTitle: "Closed-source systems delivered end to end",
    customerProjectStack: "Stack",
    education: "Education",
    languages: "Languages",
    beyond: "Beyond work",
    contactEyebrow: "Singapore opportunities",
    contactTitle: "Open to senior backend, technical leadership, and customer-facing engineering roles.",
    contactCopy: "For a role-aligned discussion, contact Jacky by email, LinkedIn, or WhatsApp.",
    footer: "Evidence-first resume site. Last verified",
    viewLinkedIn: "LinkedIn",
    backTop: "Back to top"
  },
  zh: {
    skip: "跳至主要内容",
    nav: "主要导航",
    experience: "工作经历",
    evidence: "工程交付证据",
    ai: "AI 原型",
    strengths: "技术能力",
    contact: "联系",
    currentLanguage: "简体中文",
    languageLabel: "语言",
    eyebrow: "技术领导岗位简介",
    availability: "开放高级工程及技术领导岗位机会",
    downloadResume: "下载英文简历",
    email: "电子邮件",
    whatsapp: "WhatsApp",
    highlights: "职业亮点",
    experienceEyebrow: "专业经历",
    experienceTitle: "从需求调研到上线准备的工程责任",
    directEmployee: "直接雇佣",
    casesEyebrow: "工程交付证据",
    casesTitle: "从后端开发到客户上线准备",
    prototypeEyebrow: "应用型 AI 原型",
    portraitAlt: "谢官韦（Jacky）的职业照片",
    skillsEyebrow: "岗位相关能力",
    skillsTitle: "精简且可在面试中深入说明的技术能力",
    additionalEyebrow: "其他经历",
    additionalTitle: "外部合作与独立项目",
    customerProjectsEyebrow: "独立客户项目",
    customerProjectsTitle: "端到端交付的闭源系统",
    customerProjectStack: "技术栈",
    education: "教育背景",
    languages: "语言能力",
    beyond: "工作之外",
    contactEyebrow: "新加坡机会",
    contactTitle: "开放高级后端、技术领导及客户交付型工程岗位机会。",
    contactCopy: "如需讨论匹配岗位，欢迎通过电子邮件、LinkedIn 或 WhatsApp 联系 Jacky。",
    footer: "以证据为先的职业网站。资料最后核实日期",
    viewLinkedIn: "LinkedIn",
    backTop: "返回顶部"
  }
};

const printLabels = {
  en: {
    summary: "Professional Summary",
    coreStrengths: "Core Technical Strengths",
    hybridStrengths: "Core Technical and Delivery Strengths",
    deploymentStrengths: "Deployment and Technical Strengths",
    experience: "Professional Experience",
    aiPrototype: "Applied AI Prototype",
    selectedEvidence: "Selected Engineering Evidence",
    customerProjects: "Independent Customer Projects",
    engineeringScope: "Engineering Scope",
    deploymentScope: "Deployment Scope",
    additional: "Additional Experience and Partnerships",
    education: "Education",
    languages: "Languages",
    mobility: "Mobility",
    technologyDomain: "Technology and domain",
    directEmployee: "Direct employee",
    pageOne: "Page 1 of 2",
    pageTwo: "Page 2 of 2",
    backendTarget: "Backend Lead Engineer | Technical Lead",
    fdeTarget: "Forward-Deployed Engineer | Technical Lead",
    hybridTarget: "Backend Lead Engineer | Technical Lead"
  },
  zh: {
    summary: "专业简介",
    coreStrengths: "核心技术能力",
    hybridStrengths: "核心技术与交付能力",
    deploymentStrengths: "部署与技术能力",
    experience: "专业经历",
    aiPrototype: "应用型 AI 原型",
    selectedEvidence: "精选工程证据",
    customerProjects: "独立客户项目",
    engineeringScope: "工程范围",
    deploymentScope: "部署范围",
    additional: "其他经历与合作",
    education: "教育背景",
    languages: "语言能力",
    mobility: "出差与迁移",
    technologyDomain: "技术与领域",
    directEmployee: "正式雇员",
    pageOne: "第 1 页，共 2 页",
    pageTwo: "第 2 页，共 2 页",
    backendTarget: "后端主导工程师 | 技术负责人",
    fdeTarget: "前线部署工程师 | 技术负责人",
    hybridTarget: "后端主导工程师 | 技术负责人"
  }
};

function resumeTarget(variant, lang = "en") {
  const configured = data.variants[variant]?.resumeTitle;
  return text(configured, lang) || printLabels[lang][`${variant}Target`] || printLabels[lang].backendTarget;
}

const chineseSkillLabels = new Map([
  ["REST APIs", "REST API"],
  ["System design", "系统设计"],
  ["Requirements / SRS", "需求分析 / SRS"],
  ["Testing and debugging", "测试与调试"],
  ["Code review", "代码审查"],
  ["Warehouse automation", "仓储自动化"],
  ["Commissioning", "上线调试"],
  ["Mentoring", "工程师辅导"],
  ["Technical interviews", "技术面试"],
  ["Customer workshops", "客户研讨"],
  ["Technical scoping", "技术范围界定"],
  ["Delivery risk coordination", "交付风险协调"],
  ["RAG prototyping", "RAG 原型开发"],
  ["English", "英语"],
  ["Mandarin", "普通话"],
  ["Cantonese", "粤语"],
  ["Malay", "马来语"]
]);

function skillLabel(value, lang = "en") {
  return lang === "zh" ? chineseSkillLabels.get(value) ?? value : value;
}

function renderExperience(role, lang, variant) {
  const l = labels[lang];
  return `<article class="experience-card">
    <header class="role-heading">
      <div>
        <div class="role-labels"><span class="relationship">${esc(l.directEmployee)}</span><span>${esc(text(role.location, lang))}</span></div>
        <h3>${esc(text(role.company, lang))}</h3>
        <p>${esc(text(role.title, lang))}</p>
      </div>
      <p class="role-meta">${esc(dateRange(role, lang))}</p>
    </header>
    <ul>${sortedBullets(role, variant).map((bullet) => `<li>${esc(text(bullet.text, lang))}</li>`).join("")}</ul>
    <p class="technology-line"><strong>${lang === "zh" ? "技术与领域" : "Technology and domain"}:</strong> ${role.technologies.map(esc).join(" | ")}</p>
  </article>`;
}

function renderSite(lang = "en") {
  const l = labels[lang];
  const profile = data.profile;
  const variantId = DEFAULT_VARIANT;
  const variant = data.variants[variantId];
  const base = lang === "en" ? "" : "../";
  const canonicalPath = lang === "en" ? "/" : "/zh/";
  const title = `${text(profile.displayName, lang)} - ${text(variant.title, lang)}`;
  const description = text(variant.summary, lang);
  const publicProjects = data.projects.filter((project) => project.public && project.variants.includes(variantId));
  const customerProjects = data.customerProjects.filter((project) => project.public && project.variants.includes(variantId));
  const activeResumeFilename = data.meta.artifacts.activePdfs.en;
  const languageSwitch = lang === "en"
    ? `<span aria-current="page">EN</span><span aria-hidden="true">|</span><a href="zh/index.html" lang="zh-CN">简中</a>`
    : `<a href="../index.html" lang="en">EN</a><span aria-hidden="true">|</span><span aria-current="page">简中</span>`;
  const resumeNote = lang === "zh"
    ? `<p class="translation-note" role="note">中文内容为待母语审校版本；求职申请请以英文 PDF 为准。</p>`
    : "";

  return `<!doctype html>
<html lang="${lang === "en" ? "en" : "zh-Hans"}">
<head>${renderMetadata({ lang, canonicalPath, title, description, variant: variantId })}
  <link rel="icon" href="${base}assets/img/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${base}assets/css/resume-site.css">
</head>
<body>
  <!-- ${GENERATED_NOTICE} -->
  <a class="skip-link" href="#content">${esc(l.skip)}</a>
  <header class="site-header">
    <a class="brand" href="#top" aria-label="${esc(l.backTop)}">CKW</a>
    <nav aria-label="${esc(l.nav)}">
      <a href="#experience">${esc(l.experience)}</a>
      <a class="nav-ai" href="#ai-prototype">${esc(l.ai)}</a>
      <a class="nav-skills" href="#skills">${esc(l.strengths)}</a>
      <a href="#contact">${esc(l.contact)}</a>
    </nav>
    <div class="language-switch" aria-label="${esc(l.languageLabel)}">${languageSwitch}</div>
  </header>

  <main id="content">
    <section id="top" class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="availability-badge">${esc(l.availability)}</p>
        <p class="eyebrow">${esc(l.eyebrow)}</p>
        <h1 id="hero-title">${esc(text(profile.displayName, lang))}</h1>
        <p class="headline">${esc(text(variant.title, lang))}</p>
        <p class="lede">${esc(text(variant.heroSummary, lang))}</p>
        <p class="location-line">${esc(text(profile.location, lang))} <span aria-hidden="true">|</span> ${esc(text(profile.relocation, lang))} <span aria-hidden="true">|</span> ${esc(text(profile.travel, lang))}</p>
        <div class="actions" aria-label="${esc(lang === "zh" ? "简历与联系操作" : "Resume and contact actions")}">
          <a class="button primary" href="${base}assets/download/${esc(activeResumeFilename)}" download>${esc(l.downloadResume)}</a>
          <a class="button text" href="${esc(profile.linkedinUrl)}" rel="me">${esc(l.viewLinkedIn)}</a>
          <a class="button text" href="${esc(profile.whatsappUrl)}" rel="me">${esc(l.whatsapp)}</a>
          <a class="button text" href="mailto:${esc(profile.email)}">${esc(l.email)}</a>
        </div>${resumeNote ? `\n        ${resumeNote}` : ""}
      </div>
      <figure class="hero-portrait">
        <img src="${base}assets/img/profile-img-800.webp" width="800" height="990" loading="eager" fetchpriority="high" decoding="async" alt="${esc(l.portraitAlt)}">
      </figure>
    </section>

    <section class="highlights" aria-label="${esc(l.highlights)}">
      ${data.highlights.map((item) => `<article><strong>${esc(text(item.value, lang))}</strong><span>${esc(text(item.label, lang))}</span></article>`).join("")}
    </section>

    <section id="experience" class="section" aria-labelledby="experience-title">
      <header class="section-heading">
        <p class="eyebrow">${esc(l.experienceEyebrow)}</p>
        <h2 id="experience-title">${esc(l.experienceTitle)}</h2>
      </header>
      <div class="experience-list">${data.experience.map((role) => renderExperience(role, lang, variantId)).join("")}</div>
    </section>

    <section id="customer-projects" class="section" aria-labelledby="customer-projects-title">
      <header class="section-heading">
        <p class="eyebrow">${esc(l.customerProjectsEyebrow)}</p>
        <h2 id="customer-projects-title">${esc(l.customerProjectsTitle)}</h2>
      </header>
      <div class="customer-project-grid">${customerProjects.map((project) => `<article class="customer-project-card">
        <header class="customer-project-heading"><div><p class="role-meta">${esc(projectDate(project, lang))}</p><h3>${esc(text(project.title, lang))}</h3><p class="customer-project-domain">${esc(text(project.domain, lang))}</p></div><span>${esc(text(project.label, lang))}</span></header>
        <p>${esc(text(project.summary, lang))}</p>
        <ul>${project.bullets.map((bullet) => `<li>${esc(text(bullet.text, lang))}</li>`).join("")}</ul>
        <p class="technology-line"><strong>${esc(l.customerProjectStack)}:</strong> ${project.technologies.map(esc).join(" | ")}</p>
      </article>`).join("")}</div>
    </section>

    <section id="delivery-evidence" class="section section-tint" aria-labelledby="cases-title">
      <header class="section-heading">
        <p class="eyebrow">${esc(l.casesEyebrow)}</p>
        <h2 id="cases-title">${esc(l.casesTitle)}</h2>
      </header>
      <div class="delivery-grid">${[...data.deliveryCoverage].filter((item) => item.variants.includes(variantId)).sort((a, b) => (a.priority?.[variantId] ?? Number.MAX_SAFE_INTEGER) - (b.priority?.[variantId] ?? Number.MAX_SAFE_INTEGER)).map((item, index) => `<article><span class="case-number" aria-hidden="true">0${index + 1}</span><h3>${esc(text(item.title, lang))}</h3><p>${esc(text(item.summary, lang))}</p></article>`).join("")}</div>
    </section>

    ${publicProjects.map((project) => `<section id="ai-prototype" class="section prototype-section" aria-labelledby="prototype-title">
      <header class="section-heading prototype-heading">
        <div>
          <p class="eyebrow">${esc(l.prototypeEyebrow)}</p>
          <h2 id="prototype-title">${esc(text(project.label, lang))}</h2>
        </div>
        <p class="prototype-stage">${esc(text(project.stage, lang))}</p>
      </header>
      <article class="prototype-card">
        <p class="prototype-summary">${esc(text(project.summary, lang))}</p>
        <div class="prototype-phases">${project.phases.map((phase) => `<section><h3>${esc(text(phase.title, lang))}</h3><p>${esc(text(phase.text, lang))}</p></section>`).join("")}</div>
        <p class="prototype-status">${esc(text(project.statusNote, lang))}</p>
      </article>
    </section>`).join("")}

    <section id="skills" class="section section-tint" aria-labelledby="skills-title">
      <header class="section-heading">
        <p class="eyebrow">${esc(l.skillsEyebrow)}</p>
        <h2 id="skills-title">${esc(l.skillsTitle)}</h2>
      </header>
      <div class="skill-groups">${variant.skillGroups.map((group) => `<article><h3>${esc(text(group.title, lang))}</h3><ul class="tag-list">${group.items.map((item) => `<li>${esc(skillLabel(item, lang))}</li>`).join("")}</ul></article>`).join("")}</div>
    </section>

    <section class="section" aria-labelledby="additional-title">
      <header class="section-heading">
        <p class="eyebrow">${esc(l.additionalEyebrow)}</p>
        <h2 id="additional-title">${esc(l.additionalTitle)}</h2>
      </header>
      <div class="additional-grid">${data.additionalExperience.map((item) => `<article class="additional-card"><p class="role-meta">${esc(dateRange(item, lang))}</p><h3>${esc(text(item.organization, lang))}</h3><p class="additional-title">${esc(text(item.title, lang))} | ${esc(text(item.location, lang))}</p><p>${esc(text(item.bullets[0].text, lang))}</p></article>`).join("")}</div>
    </section>

    <section class="section credentials" aria-label="${esc(lang === "zh" ? "教育与语言" : "Education and languages")}">
      <article>
        <h2>${esc(l.education)}</h2>
        ${data.education.map((item) => `<div class="credential"><h3>${esc(text(item.credential, lang))}</h3><p>${esc(text(item.institution, lang))} | ${esc(item.end)}</p></div>`).join("")}
      </article>
      <article>
        <h2>${esc(l.languages)}</h2>
        <ul class="language-list">${profile.languages.map((item) => `<li><strong>${esc(text(item.name, lang))}</strong><span>${esc(text(item.level, lang))}</span></li>`).join("")}</ul>
        <h3 class="beyond-title">${esc(l.beyond)}</h3>
        <p>${esc(text(data.beyondWork, lang))}</p>
      </article>
    </section>

    <section id="contact" class="contact-band" aria-labelledby="contact-title">
      <p class="eyebrow">${esc(l.contactEyebrow)}</p>
      <h2 id="contact-title">${esc(l.contactTitle)}</h2>
      <p>${esc(l.contactCopy)}</p>
      <div class="contact-links"><a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a><a href="${esc(profile.linkedinUrl)}" rel="me">${esc(profile.linkedinLabel)}</a><a href="${esc(profile.whatsappUrl)}" rel="me">${esc(l.whatsapp)}</a></div>
    </section>
  </main>

  <footer class="site-footer"><p>${esc(l.footer)} ${esc(data.meta.lastVerified)}.</p><a href="#top">${esc(l.backTop)}</a></footer>
</body>
</html>`;
}

function renderResumeHeader(variant, lang = "en", assetBase = "") {
  const profile = data.profile;
  const print = printLabels[lang];
  const portraitSrc = assetBase ? `${assetBase}/assets/img/profile-img-800.webp` : "../../assets/img/profile-img-800.webp";
  return `<header class="resume-header">
    <div class="resume-header-content">
      <h1>${esc(text(profile.displayName, lang))}</h1>
      <p class="resume-target">${esc(resumeTarget(variant, lang))}</p>
      <p class="resume-location">${esc(text(profile.location, lang))} | ${esc(text(profile.relocation, lang))} | ${esc(text(profile.travel, lang))}</p>
      <div class="resume-contact" aria-label="Contact details">
        <a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a>
        <a href="${esc(profile.phoneHref)}">${esc(profile.phone)}</a>
        <a href="${esc(profile.linkedinUrl)}">${esc(profile.linkedinLabel)}</a>
        <a href="${esc(profile.whatsappUrl)}">${esc(profile.whatsappLabel)}</a>
        <a href="${esc(profile.portfolioUrl)}">${esc(profile.portfolioLabel)}</a>
      </div>
    </div>
    <img class="resume-header-photo" src="${portraitSrc}" width="800" height="990" loading="eager" decoding="async" alt="${esc(lang === "zh" ? "谢官韦（Jacky）的职业照片" : "Professional portrait of Chay Kun Wai (Jacky)")}">
  </header>`;
}

function renderCompactExperience(role, variant, lang = "en") {
  const print = printLabels[lang];
  return `<article class="resume-role">
    <header><div><h3>${esc(text(role.company, lang))}</h3><p>${esc(text(role.title, lang))} | ${esc(text(role.location, lang))}${role.relationship === "direct-employment" ? ` | ${esc(print.directEmployee)}` : ""}</p></div><p class="resume-date">${esc(dateRange(role, lang))}</p></header>
    <ul>${sortedBullets(role, variant).map((bullet) => `<li>${esc(text(bullet.text, lang))}</li>`).join("")}</ul>
    <p class="resume-tech"><strong>${esc(print.technologyDomain)}:</strong> ${role.technologies.map(esc).join(" | ")}</p>
  </article>`;
}

function renderResume(variant, lang = "en", assetBase = "") {
  const profile = data.profile;
  const role = data.variants[variant];
  const print = printLabels[lang];
  const isHybrid = variant === "hybrid";
  const title = `${text(profile.displayName, lang)} - ${resumeTarget(variant, lang)}`;
  const cssHref = assetBase ? `${assetBase}/assets/css/resume-print.css` : "../../assets/css/resume-print.css";
  const coverage = [...data.deliveryCoverage].filter((item) => item.variants.includes(variant)).sort((a, b) => (a.priority?.[variant] ?? Number.MAX_SAFE_INTEGER) - (b.priority?.[variant] ?? Number.MAX_SAFE_INTEGER));
  const variantCases = data.caseStudies.filter((item) => item.variants.includes(variant));
  const publicProjects = data.projects.filter((project) => project.public && project.variants.includes(variant));
  const customerProjects = data.customerProjects.filter((project) => project.public && project.variants.includes(variant));
  const renderedSkills = role.skillGroups.flatMap((group) => [text(group.title, lang), ...group.items.map((item) => skillLabel(item, lang))]);
  const contentTexts = [
    text(role.summary, lang),
    ...renderedSkills,
    ...data.experience.flatMap((item) => sortedBullets(item, variant).map((bullet) => text(bullet.text, lang))),
    ...data.experience.flatMap((item) => item.technologies),
    ...customerProjects.flatMap((project) => [text(project.summary, lang), ...project.bullets.map((bullet) => text(bullet.text, lang))]),
    ...customerProjects.flatMap((project) => project.technologies),
    ...publicProjects.flatMap((project) => [text(project.summary, lang), ...project.phases.map((phase) => text(phase.text, lang)), text(project.statusNote, lang)]),
    ...(isHybrid ? [] : variantCases.map((item) => text(item.summary, lang))),
    ...(isHybrid ? [] : coverage.map((item) => text(item.summary, lang))),
    ...data.additionalExperience.flatMap((item) => [text(item.organization, lang), text(item.title, lang), ...item.bullets.map((bullet) => text(bullet.text, lang))]),
    ...data.education.flatMap((item) => [text(item.credential, lang), text(item.institution, lang)]),
    ...profile.languages.flatMap((item) => [text(item.name, lang), text(item.level, lang)]),
    ...(variant === "fde" ? [text(profile.relocation, lang), text(profile.travel, lang)] : [])
  ];
  const allWords = lang === "zh"
    ? contentTexts.join("").replace(/\s/g, "").length
    : contentTexts.join(" ").trim().split(/\s+/).length;
  const documentLang = lang === "zh" ? "zh-Hans" : "en";

  return `<!doctype html>
<html lang="${documentLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="description" content="${esc(text(role.summary, lang))}">
  <meta name="author" content="${esc(profile.legalName)}">
  <meta name="generator" content="Canonical resume build pipeline">
  <title>${esc(title)}</title>
  <link rel="canonical" href="${BASE_URL}/resume/${variant}/">
  <link rel="stylesheet" href="${cssHref}">
</head>
<body data-variant="${esc(variant)}" data-language="${esc(lang)}" data-core-word-count="${allWords}">
  <!-- ${GENERATED_NOTICE} -->
  <main class="resume-document">
    <section class="resume-sheet" aria-label="${esc(print.pageOne)}">
      ${renderResumeHeader(variant, lang, assetBase)}
      <section class="resume-section resume-summary">
        <h2>${esc(print.summary)}</h2>
        <p>${esc(text(role.summary, lang))}</p>
      </section>
      <section class="resume-section">
        <h2>${esc(variant === "fde" ? print.deploymentStrengths : (isHybrid ? print.hybridStrengths : print.coreStrengths))}</h2>
        <div class="resume-skill-groups">${role.skillGroups.map((group) => `<p><strong>${esc(text(group.title, lang))}:</strong> ${group.items.map((item) => esc(skillLabel(item, lang))).join(" | ")}</p>`).join("")}</div>
      </section>
      <section class="resume-section resume-experience">
        <h2>${esc(print.experience)}</h2>
        ${data.experience.map((item) => renderCompactExperience(item, variant, lang)).join("")}
      </section>
      <p class="page-number" aria-hidden="true">${esc(print.pageOne)}</p>
    </section>

    <section class="resume-sheet" aria-label="${esc(print.pageTwo)}">
      <div class="resume-continuation"><strong>${esc(text(profile.displayName, lang))}</strong><span>${esc(resumeTarget(variant, lang))}</span></div>
      <section class="resume-section resume-customer-projects">
        <h2>${esc(print.customerProjects)}</h2>
        <div class="resume-customer-grid">${customerProjects.map((project) => `<article>
          <header><div><h3>${esc(text(project.title, lang))}</h3><p>${esc(text(project.domain, lang))} | ${esc(text(project.label, lang))}</p></div><p class="resume-date">${esc(projectDate(project, lang))}</p></header>
          <p>${esc(text(project.summary, lang))}</p>
${isHybrid && project.bullets?.length ? `          <ul>${project.bullets.filter((bullet) => bullet.status === "verified").map((bullet) => `<li>${esc(text(bullet.text, lang))}</li>`).join("")}</ul>\n` : ""}          <p class="resume-tech"><strong>${esc(lang === "zh" ? "技术栈" : "Stack")}:</strong> ${project.technologies.map(esc).join(" | ")}</p>
        </article>`).join("")}</div>
      </section>
      ${publicProjects.map((project) => `<section class="resume-section resume-project">
        <h2>${esc(print.aiPrototype)}</h2>
        <article>
          <header><h3>${esc(text(project.label, lang))}</h3><p>${esc(text(project.stage, lang))}</p></header>
          <p>${esc(text(project.summary, lang))}</p>
          <ul>${project.phases.map((phase) => `<li><strong>${esc(text(phase.title, lang))}:</strong> ${esc(text(phase.text, lang))}</li>`).join("")}</ul>
          <p class="resume-project-status">${esc(text(project.statusNote, lang))}</p>
        </article>
      </section>`).join("")}
      ${isHybrid ? "" : `<section class="resume-section">
        <h2>${esc(print.selectedEvidence)}</h2>
        <div class="resume-case-list">${variantCases.map((item) => `<article><h3>${esc(text(item.title, lang))}</h3><p>${esc(text(item.summary, lang))}</p></article>`).join("")}</div>
      </section>
      <section class="resume-section">
        <h2>${esc(variant === "fde" ? print.deploymentScope : print.engineeringScope)}</h2>
        <div class="resume-coverage">${coverage.map((item) => `<article><h3>${esc(text(item.title, lang))}</h3><p>${esc(text(item.summary, lang))}</p></article>`).join("")}</div>
      </section>`}
      <section class="resume-section">
        <h2>${esc(print.additional)}</h2>
        <div class="resume-additional">${data.additionalExperience.map((item) => `<article><header><h3>${esc(text(item.organization, lang))}</h3><p class="resume-date">${esc(dateRange(item, lang))}</p></header><p><strong>${esc(text(item.title, lang))}</strong> | ${esc(text(item.location, lang))}</p><ul>${item.bullets.map((bullet) => `<li>${esc(text(bullet.text, lang))}</li>`).join("")}</ul></article>`).join("")}</div>
      </section>
      <section class="resume-bottom-grid">
        <article class="resume-section">
          <h2>${esc(print.education)}</h2>
          ${data.education.map((item) => `<div class="resume-credential"><h3>${esc(text(item.credential, lang))}</h3><p>${esc(text(item.institution, lang))} | ${esc(item.end)}</p></div>`).join("")}
        </article>
        <article class="resume-section">
          <h2>${esc(print.languages)}</h2>
          <p>${profile.languages.map((item) => `${esc(text(item.name, lang))} (${esc(text(item.level, lang))})`).join(" | ")}</p>
          ${variant === "fde" ? `<p class="travel-note"><strong>${esc(print.mobility)}:</strong> ${esc(text(profile.relocation, lang))} | ${esc(text(profile.travel, lang))}</p>` : ""}
        </article>
      </section>
      <p class="page-number" aria-hidden="true">${esc(print.pageTwo)}</p>
    </section>
  </main>
</body>
</html>`;
}

async function writeGenerated(relativePath, content) {
  const destination = path.join(ROOT, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content.replaceAll("\r\n", "\n"), "utf8");
}

async function generateStaticFiles() {
  validateCanonicalData();
  await Promise.all([
    writeGenerated("index.html", renderSite("en")),
    writeGenerated(path.join("zh", "index.html"), renderSite("zh")),
    writeGenerated(path.join("resume", "hybrid", "index.html"), renderResume("hybrid")),
    writeGenerated(path.join("resume", "backend", "index.html"), renderResume("backend")),
    writeGenerated(path.join("resume", "fde", "index.html"), renderResume("fde"))
  ]);
  console.log("Generated English, Simplified Chinese, hybrid, backend, and FDE static pages.");
}

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

async function resolveRequestPath(urlPath) {
  let relative = decodeURIComponent(urlPath.split("?")[0]);
  if (relative.endsWith("/")) relative += "index.html";
  relative = relative.replace(/^\/+/, "");
  const candidate = path.resolve(ROOT, relative);
  if (!candidate.startsWith(`${ROOT}${path.sep}`) && candidate !== ROOT) return null;
  try {
    const info = await stat(candidate);
    return info.isDirectory() ? path.join(candidate, "index.html") : candidate;
  } catch {
    return null;
  }
}

async function startStaticServer() {
  const server = createServer(async (request, response) => {
    const filename = await resolveRequestPath(request.url ?? "/");
    if (!filename) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filename).toLowerCase()] ?? "application/octet-stream" });
    response.end(await readFile(filename));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function exportPdfs() {
  const { chromium } = await import("playwright");
  const { server, origin } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const activePdfs = data.meta.artifacts.activePdfs;
    const archiveNames = new Set((data.meta.artifacts.archives ?? []).map((archive) => archive.filename));
    const outputs = [
      ["hybrid", activePdfs.en, "en"],
      ["hybrid", activePdfs.zh, "zh"]
    ];
    assert(outputs.length === 2, "exactly two active PDF exports are required");
    outputs.forEach(([, filename]) => {
      assert(filename && !archiveNames.has(filename), `${filename} is not an allowed active PDF destination`);
    });
    for (const [variant, filename, lang] of outputs) {
      const page = await browser.newPage();
      if (lang === "zh") {
        await page.setContent(renderResume(variant, lang, origin), { waitUntil: "networkidle" });
      } else {
        await page.goto(`${origin}/resume/${variant}/`, { waitUntil: "networkidle" });
      }
      await page.emulateMedia({ media: "print" });
      await page.evaluate(() => document.fonts.ready);
      const sheetMetrics = await page.locator(".resume-sheet").evaluateAll((sheets) => sheets.map((sheet) => ({ clientHeight: sheet.clientHeight, scrollHeight: sheet.scrollHeight })));
      assert(sheetMetrics.length === 2, `${variant}/${lang} print page must contain exactly two explicit sheets`);
      sheetMetrics.forEach((metric, index) => assert(metric.scrollHeight <= metric.clientHeight + 2, `${variant}/${lang} page ${index + 1} overflows its A4 sheet`));
      const destination = path.join(ROOT, "assets", "download", filename);
      await page.pdf({
        path: destination,
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        tagged: true,
        outline: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" }
      });
      await page.close();
      console.log(`Exported ${path.relative(ROOT, destination)}.`);
    }
    console.log("Updated the English and Simplified Chinese hybrid PDF downloads.");
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

await generateStaticFiles();
if (process.argv.includes("--pdf")) await exportPdfs();
