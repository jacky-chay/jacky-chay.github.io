import { createServer } from "node:http";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "src", "resume-data.json");
const GENERATED_NOTICE = "Generated from src/resume-data.json by scripts/build-resume.mjs. Do not edit directly.";
const BASE_URL = "https://jacky-chay.github.io";

const data = JSON.parse(await readFile(DATA_PATH, "utf8"));

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
  assert(data.profile?.legalName && data.profile?.email && data.profile?.phone, "profile identity and contact fields are required");
  assert(data.variants?.backend && data.variants?.fde, "both backend and fde variants are required");
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

function publicEntityLabel(entity, lang) {
  if (entity?.usePublicName && entity?.approved) return entity.publicName;
  return text(entity?.fallback, lang);
}

function sortedBullets(role, variant) {
  return role.bullets
    .filter((bullet) => bullet.status === "verified" && bullet.variants.includes(variant))
    .sort((a, b) => a.priority[variant] - b.priority[variant]);
}

function renderMetadata({ lang, canonicalPath, title, description }) {
  const canonical = `${BASE_URL}${canonicalPath}`;
  const profile = data.profile;
  const structured = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.legalName,
    alternateName: "Jacky Chay",
    url: profile.portfolioUrl,
    jobTitle: text(data.variants.backend.title, lang),
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
    downloadBackend: "Download Backend Lead Resume",
    downloadFde: "Download FDE Resume",
    email: "Email",
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
    education: "Education",
    languages: "Languages",
    beyond: "Beyond work",
    contactEyebrow: "Singapore opportunities",
    contactTitle: "Open to senior backend and customer-facing engineering roles.",
    contactCopy: "For a role-aligned discussion, contact Jacky by email or LinkedIn.",
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
    downloadBackend: "下载后端负责人简历",
    downloadFde: "下载客户交付工程简历",
    email: "电子邮件",
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
    education: "教育背景",
    languages: "语言能力",
    beyond: "工作之外",
    contactEyebrow: "新加坡机会",
    contactTitle: "开放高级后端及客户交付型工程岗位机会。",
    contactCopy: "如需讨论匹配岗位，欢迎通过电子邮件或 LinkedIn 联系 Jacky。",
    footer: "以证据为先的职业网站。资料最后核实日期",
    viewLinkedIn: "LinkedIn",
    backTop: "返回顶部"
  }
};

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
  const variant = data.variants.backend;
  const base = lang === "en" ? "" : "../";
  const canonicalPath = lang === "en" ? "/" : "/zh/";
  const title = lang === "en"
    ? `${profile.displayName.en} - Backend Lead Engineer & Technical Lead`
    : `${profile.displayName.zh} - 后端主导工程师及技术负责人`;
  const description = text(variant.summary, lang);
  const publicProjects = data.projects.filter((project) => project.public && project.variants.includes("backend"));
  const languageSwitch = lang === "en"
    ? `<span aria-current="page">EN</span><span aria-hidden="true">|</span><a href="zh/" lang="zh-CN">简中</a>`
    : `<a href="../" lang="en">EN</a><span aria-hidden="true">|</span><span aria-current="page">简中</span>`;
  const resumeNote = lang === "zh"
    ? `<p class="translation-note" role="note">中文内容为待母语审校版本；求职申请请以英文 PDF 为准。</p>`
    : "";

  return `<!doctype html>
<html lang="${lang === "en" ? "en" : "zh-Hans"}">
<head>${renderMetadata({ lang, canonicalPath, title, description })}
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
          <a class="button primary" href="${base}assets/download/Kun-Wai-Chay-Backend-Lead-Engineer.pdf" download>${esc(l.downloadBackend)}</a>
          <a class="button" href="${base}assets/download/Kun-Wai-Chay-Forward-Deployed-Engineer.pdf" download>${esc(l.downloadFde)}</a>
          <a class="button text" href="${esc(profile.linkedinUrl)}" rel="me">${esc(l.viewLinkedIn)}</a>
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
      <div class="experience-list">${data.experience.map((role) => renderExperience(role, lang, "backend")).join("")}</div>
    </section>

    <section id="delivery-evidence" class="section section-tint" aria-labelledby="cases-title">
      <header class="section-heading">
        <p class="eyebrow">${esc(l.casesEyebrow)}</p>
        <h2 id="cases-title">${esc(l.casesTitle)}</h2>
      </header>
      <div class="delivery-grid">${[...data.deliveryCoverage].sort((a, b) => a.priority.backend - b.priority.backend).map((item, index) => `<article><span class="case-number" aria-hidden="true">0${index + 1}</span><h3>${esc(text(item.title, lang))}</h3><p>${esc(text(item.summary, lang))}</p></article>`).join("")}</div>
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
      <div class="skill-groups">${variant.skillGroups.map((group) => `<article><h3>${esc(text(group.title, lang))}</h3><ul class="tag-list">${group.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></article>`).join("")}</div>
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
      <div class="contact-links"><a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a><a href="${esc(profile.linkedinUrl)}" rel="me">${esc(profile.linkedinLabel)}</a></div>
    </section>
  </main>

  <footer class="site-footer"><p>${esc(l.footer)} ${esc(data.meta.lastVerified)}.</p><a href="#top">${esc(l.backTop)}</a></footer>
</body>
</html>`;
}

function renderResumeHeader(variant) {
  const profile = data.profile;
  return `<header class="resume-header">
    <h1>${esc(profile.displayName.en)}</h1>
    <p class="resume-target">${esc(data.variants[variant].resumeTitle)}</p>
    <p class="resume-location">${esc(profile.location.en)} | ${esc(profile.relocation.en)} | ${esc(profile.travel.en)}</p>
    <div class="resume-contact" aria-label="Contact details">
      <a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a>
      <a href="${esc(profile.phoneHref)}">${esc(profile.phone)}</a>
      <a href="${esc(profile.linkedinUrl)}">${esc(profile.linkedinLabel)}</a>
      <a href="${esc(profile.portfolioUrl)}">${esc(profile.portfolioLabel)}</a>
    </div>
  </header>`;
}

function renderCompactExperience(role, variant) {
  return `<article class="resume-role">
    <header><div><h3>${esc(text(role.company))}</h3><p>${esc(text(role.title))} | ${esc(text(role.location))}${role.relationship === "direct-employment" ? " | Direct employee" : ""}</p></div><p class="resume-date">${esc(dateRange(role))}</p></header>
    <ul>${sortedBullets(role, variant).map((bullet) => `<li>${esc(text(bullet.text))}</li>`).join("")}</ul>
    <p class="resume-tech"><strong>Technology and domain:</strong> ${role.technologies.map(esc).join(" | ")}</p>
  </article>`;
}

function renderResume(variant) {
  const profile = data.profile;
  const role = data.variants[variant];
  const title = `${profile.displayName.en} - ${role.resumeTitle}`;
  const coverage = [...data.deliveryCoverage].sort((a, b) => a.priority[variant] - b.priority[variant]);
  const variantCases = data.caseStudies.filter((item) => item.variants.includes(variant));
  const publicProjects = data.projects.filter((project) => project.public && project.variants.includes(variant));
  const allWords = [role.summary.en, ...data.experience.flatMap((item) => sortedBullets(item, variant).map((bullet) => bullet.text.en)), ...publicProjects.flatMap((project) => [project.summary.en, ...project.phases.map((phase) => phase.text.en), project.statusNote.en]), ...variantCases.map((item) => item.summary.en), ...coverage.map((item) => item.summary.en), ...data.additionalExperience.flatMap((item) => item.bullets.map((bullet) => bullet.text.en))].join(" ").trim().split(/\s+/).length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${esc(role.summary.en)}">
  <meta name="author" content="${esc(profile.legalName)}">
  <meta name="generator" content="Canonical resume build pipeline">
  <title>${esc(title)}</title>
  <link rel="canonical" href="${BASE_URL}/resume/${variant}/">
  <link rel="stylesheet" href="../../assets/css/resume-print.css">
</head>
<body data-variant="${esc(variant)}" data-core-word-count="${allWords}">
  <!-- ${GENERATED_NOTICE} -->
  <main class="resume-document">
    <section class="resume-sheet" aria-label="Page 1 of 2">
      ${renderResumeHeader(variant)}
      <section class="resume-section resume-summary">
        <h2>Professional Summary</h2>
        <p>${esc(role.summary.en)}</p>
      </section>
      <section class="resume-section">
        <h2>${variant === "fde" ? "Deployment and Technical Strengths" : "Core Technical Strengths"}</h2>
        <div class="resume-skill-groups">${role.skillGroups.map((group) => `<p><strong>${esc(group.title.en)}:</strong> ${group.items.map(esc).join(" | ")}</p>`).join("")}</div>
      </section>
      <section class="resume-section resume-experience">
        <h2>Professional Experience</h2>
        ${data.experience.map((item) => renderCompactExperience(item, variant)).join("")}
      </section>
      <p class="page-number" aria-hidden="true">1 / 2</p>
    </section>

    <section class="resume-sheet" aria-label="Page 2 of 2">
      <div class="resume-continuation"><strong>${esc(profile.displayName.en)}</strong><span>${esc(role.resumeTitle)}</span></div>
      ${publicProjects.map((project) => `<section class="resume-section resume-project">
        <h2>Applied AI Prototype</h2>
        <article>
          <header><h3>${esc(project.label.en)}</h3><p>${esc(project.stage.en)}</p></header>
          <p>${esc(project.summary.en)}</p>
          <ul>${project.phases.map((phase) => `<li><strong>${esc(phase.title.en)}:</strong> ${esc(phase.text.en)}</li>`).join("")}</ul>
          <p class="resume-project-status">${esc(project.statusNote.en)}</p>
        </article>
      </section>`).join("")}
      <section class="resume-section">
        <h2>Selected Engineering Evidence</h2>
        <div class="resume-case-list">${variantCases.map((item) => `<article><h3>${esc(item.title.en)}</h3><p>${esc(item.summary.en)}</p></article>`).join("")}</div>
      </section>
      <section class="resume-section">
        <h2>${variant === "fde" ? "Deployment Scope" : "Engineering Scope"}</h2>
        <div class="resume-coverage">${coverage.map((item) => `<article><h3>${esc(item.title.en)}</h3><p>${esc(item.summary.en)}</p></article>`).join("")}</div>
      </section>
      <section class="resume-section">
        <h2>Additional Experience and Partnerships</h2>
        <div class="resume-additional">${data.additionalExperience.map((item) => `<article><header><h3>${esc(item.organization.en)}</h3><p class="resume-date">${esc(dateRange(item))}</p></header><p><strong>${esc(item.title.en)}</strong> | ${esc(item.location.en)}</p><ul>${item.bullets.map((bullet) => `<li>${esc(bullet.text.en)}</li>`).join("")}</ul></article>`).join("")}</div>
      </section>
      <section class="resume-bottom-grid">
        <article class="resume-section">
          <h2>Education</h2>
          ${data.education.map((item) => `<div class="resume-credential"><h3>${esc(item.credential.en)}</h3><p>${esc(item.institution.en)} | ${esc(item.end)}</p></div>`).join("")}
        </article>
        <article class="resume-section">
          <h2>Languages</h2>
          <p>${profile.languages.map((item) => `${esc(item.name.en)} (${esc(item.level.en)})`).join(" | ")}</p>
          ${variant === "fde" ? `<p class="travel-note"><strong>Mobility:</strong> ${esc(profile.relocation.en)} | ${esc(profile.travel.en)}</p>` : ""}
        </article>
      </section>
      <p class="page-number" aria-hidden="true">2 / 2</p>
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
    writeGenerated(path.join("resume", "backend", "index.html"), renderResume("backend")),
    writeGenerated(path.join("resume", "fde", "index.html"), renderResume("fde"))
  ]);
  console.log("Generated English, Simplified Chinese, backend, and FDE static pages.");
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
    const outputs = [
      ["backend", "Kun-Wai-Chay-Backend-Lead-Engineer.pdf"],
      ["fde", "Kun-Wai-Chay-Forward-Deployed-Engineer.pdf"]
    ];
    for (const [variant, filename] of outputs) {
      const page = await browser.newPage();
      await page.goto(`${origin}/resume/${variant}/`, { waitUntil: "networkidle" });
      await page.emulateMedia({ media: "print" });
      await page.evaluate(() => document.fonts.ready);
      const sheetMetrics = await page.locator(".resume-sheet").evaluateAll((sheets) => sheets.map((sheet) => ({ clientHeight: sheet.clientHeight, scrollHeight: sheet.scrollHeight })));
      assert(sheetMetrics.length === 2, `${variant} print page must contain exactly two explicit sheets`);
      sheetMetrics.forEach((metric, index) => assert(metric.scrollHeight <= metric.clientHeight + 2, `${variant} page ${index + 1} overflows its A4 sheet`));
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
    const backendSource = path.join(ROOT, "assets", "download", "Kun-Wai-Chay-Backend-Lead-Engineer.pdf");
    for (const alias of ["Kun-Wai-Chay-Senior-Backend-Engineer.pdf", "Chay Kun Wai - Resume.pdf"]) {
      await copyFile(backendSource, path.join(ROOT, "assets", "download", alias));
    }
    console.log("Updated the backend compatibility aliases with byte-identical copies.");
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

await generateStaticFiles();
if (process.argv.includes("--pdf")) await exportPdfs();
