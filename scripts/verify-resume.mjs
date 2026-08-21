import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { chromium } from "playwright";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = "https://jacky-chay.github.io";
const GENERATED_NOTICE = "Generated from src/resume-data.json by scripts/build-resume.mjs. Do not edit directly.";
const failures = [];
const warnings = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function noteWarning(message) {
  warnings.push(message);
}

async function exists(filename) {
  try {
    return (await stat(filename)).isFile();
  } catch {
    return false;
  }
}

const routes = [
  { pathname: "/", file: "index.html", language: "en" },
  { pathname: "/zh/", file: "zh/index.html", language: "zh-Hans" },
  { pathname: "/resume/backend/", file: "resume/backend/index.html", language: "en" },
  { pathname: "/resume/fde/", file: "resume/fde/index.html", language: "en" }
];

const htmlByRoute = new Map();

async function verifyCanonicalAndHtml() {
  const canonical = JSON.parse(await readFile(path.join(ROOT, "src", "resume-data.json"), "utf8"));
  check(canonical.meta.schemaVersion === 1, "Canonical schema version must be 1.");
  check(canonical.meta.translationReview === "pending-native-review" || canonical.meta.translationReview === "human-reviewed", "Chinese translation review state is missing.");
  for (const [variantName, variant] of Object.entries(canonical.variants ?? {})) {
    check(variant.heroSummary?.en && variant.heroSummary?.zh, `${variantName} is missing its bilingual canonical hero summary.`);
  }
  check(canonical.profile?.location?.en === "Malaysia-based", "Profile location must identify Malaysia as the base.");
  check(canonical.profile?.travel?.en === "Open to frequent worldwide travel", "Profile travel availability must state worldwide travel.");
  check(canonical.profile?.whatsappUrl === "https://wa.me/601111351951", "Profile WhatsApp link must use the verified wa.me URL.");
  const midea = canonical.experience.find((role) => role.id === "midea");
  check(midea?.start === "2024-12" && midea?.end === "2026-07", "Midea must use Dec 2024 - Jul 2026.");
  check(midea?.title?.en === "Backend Lead Engineer (Technical Lead)", "Midea must retain the verified Backend Lead Engineer title and Technical Lead equivalence.");
  check(midea?.location?.en === "China office and customer sites", "Midea must clearly identify the China office and customer-site assignment.");
  const swisslog = canonical.experience.find((role) => role.id === "swisslog");
  check(swisslog?.start === "2020-02" && swisslog?.end === "2024-12", "Swisslog must use Feb 2020 - Dec 2024.");
  check(swisslog?.title?.en === "Software Application Engineer", "Swisslog must retain the verified Software Application Engineer title.");
  check(swisslog?.location?.en === "Malaysia office and regional customer sites", "Swisslog must clearly identify its Malaysia base.");
  check(canonical.additionalExperience.find((item) => item.id === "netease")?.type === "external-kol-partnership", "NetEase relationship must remain external/KOL.");
  check(canonical.projects.length === 1, "The AI prototype evidence record is missing or duplicated.");
  for (const project of canonical.projects) {
    check(project.status === "verified" && project.public === true, `${project.id} must contain a verified public-safe prototype summary.`);
    check(project.interviewReady === false, `${project.id} must retain its incomplete interview-evidence gate.`);
    check(/prototype/i.test(project.label?.en ?? ""), `${project.id} must be explicitly labeled Prototype.`);
    check(/not released/i.test(project.stage?.en ?? ""), `${project.id} must state that it was not released.`);
    check(project.phases?.some((phase) => phase.kind === "implemented-prototype"), `${project.id} is missing its implemented V1 record.`);
    check(project.phases?.some((phase) => phase.kind === "planned-not-implemented" && /planned/i.test(phase.title?.en ?? "")), `${project.id} must distinguish planned V2 from implemented V1.`);
    check(Array.isArray(project.evidenceNeeded) && project.evidenceNeeded.length >= 5, `${project.id} is missing its remaining evidence checklist.`);
  }
  check(canonical.customerProjects?.length === 2, "The two independent customer project records are missing or duplicated.");
  for (const project of canonical.customerProjects ?? []) {
    check(project.status === "verified" && project.public === true && project.confidential === true, `${project.id} must remain a verified anonymized public project.`);
    check(project.relationship === "independent-customer-delivery", `${project.id} must remain separate from employment history.`);
    check(project.start && project.end, `${project.id} is missing its verified 2026 date.`);
    const stack = project.technologies?.join(" ") ?? "";
    check(["Angular", "React", "Java EE", "WildFly", "PostgreSQL"].every((technology) => stack.includes(technology)), `${project.id} is missing its verified technology stack.`);
    check(project.commercialNote?.status === "private-summary", `${project.id} must keep commercial terms private.`);
  }

  const canonicalText = JSON.stringify(canonical);
  check(!/\[(?:todo|tbd|placeholder|insert|verify|metric|company|customer|name)[^\]]*\]/i.test(canonicalText), "Canonical data contains a bracketed placeholder.");
  check(!/\b(?:production ai|production llm|deployed ai|deployed llm)\b/i.test(canonicalText), "Canonical data contains a prohibited production-AI claim.");
  check(!/99\.99%/i.test(canonicalText), "Canonical data contains an unsupported AI-problem prevalence metric.");
  check(!/\b7\+\s+years?\b/i.test(canonicalText), "Canonical data rounds experience up to an unsupported 7+ years.");
  check(!/\b(?:involved in|helped with|responsible for|hard-working|fast learner|cutting-edge|big project|excellent time management)\b/i.test(canonicalText), "Canonical data contains banned resume wording.");

  for (const route of routes) {
    const filename = path.join(ROOT, route.file);
    check(await exists(filename), `${route.pathname} output is missing.`);
    if (!(await exists(filename))) continue;
    const html = await readFile(filename, "utf8");
    htmlByRoute.set(route.pathname, html);
    check(html.includes(GENERATED_NOTICE), `${route.pathname} is missing its generated-file notice.`);
    check(new RegExp(`<html lang=["']${route.language}["']`).test(html), `${route.pathname} has the wrong document language.`);
    check(!/href\s*=\s*["'](?:#|)["']/i.test(html), `${route.pathname} contains an empty or placeholder link.`);
    check(!/(?:aos|typed\.js|swiper|isotope|glightbox|purecounter|bootstrap-icons|font-awesome)/i.test(html), `${route.pathname} references retired template libraries.`);
    check(!/Generated by Gemini/i.test(html), `${route.pathname} still credits generated content.`);
    check(!/facebook|instagram|wechat/i.test(html), `${route.pathname} contains personal social links.`);
    if (route.language === "zh-Hans") {
      check(html.includes("AI 辅助 WMS 故障排查原型") && html.includes("原型 V1") && html.includes("规划中的 V2") && html.includes("内部原型 - 尚未发布"), `${route.pathname} is missing the scoped Chinese AI prototype case study.`);
      check(html.includes("ManualWarehouse 仓储管理系统") && html.includes("潜水中心出勤与账单系统"), `${route.pathname} is missing the two Chinese independent customer projects.`);
    } else {
      check(html.includes("AI-Assisted WMS Troubleshooting Prototype") && html.includes("Prototype V1") && html.includes("Planned V2") && html.includes("Internal prototype - not released"), `${route.pathname} is missing the scoped AI prototype case study.`);
      check(html.includes("ManualWarehouse WMS") && html.includes("Dive Center Attendance and Billing System"), `${route.pathname} is missing the two independent customer projects.`);
    }
    check(!/\b(?:birth|born)\b|\bage\s*[:<]/i.test(html), `${route.pathname} exposes birth or age information.`);
    check(/<title>[^<]{10,}<\/title>/i.test(html), `${route.pathname} lacks a descriptive title.`);
    check(/<meta name="description" content="[^"]{60,}"/i.test(html), `${route.pathname} lacks a useful meta description.`);
    check(/rel="canonical"/i.test(html), `${route.pathname} lacks a canonical URL.`);
    if (route.pathname.startsWith("/resume/")) {
      check(/class="resume-header-photo"/i.test(html), `${route.pathname} is missing the resume header portrait.`);
      check(/assets\/img\/profile-img-800\.webp/i.test(html), `${route.pathname} is missing the canonical portrait asset.`);
    }
    if (!route.pathname.startsWith("/resume/")) {
      check(/hreflang="en"/i.test(html) && /hreflang="zh-Hans"/i.test(html), `${route.pathname} lacks bilingual hreflang links.`);
      check(/property="og:image"/i.test(html), `${route.pathname} lacks Open Graph image metadata.`);
    }
  }

  for (const route of routes.filter((entry) => !entry.pathname.startsWith("/resume/"))) {
    const html = htmlByRoute.get(route.pathname) ?? "";
    check(!html.includes(canonical.profile.phone), `${route.pathname} must not publish a phone number.`);
    check(html.includes(canonical.profile.whatsappUrl), `${route.pathname} is missing the WhatsApp contact link.`);
    check(!/github\.com|github profile/i.test(html), `${route.pathname} must not link GitHub before the profile is upgraded.`);
      check(/<main\b/i.test(html) && /<h1\b/i.test(html) && /id="experience"/i.test(html), `${route.pathname} is missing semantic professional content.`);
      check(/class="hero-portrait"/i.test(html), `${route.pathname} is missing the compact hero portrait.`);
      check(/id="delivery-evidence"/i.test(html), `${route.pathname} is missing the merged delivery evidence section.`);
      check(!/profile-panel|Professional profile|工作方式|method-list|methods-title/i.test(html), `${route.pathname} retains the retired duplicate profile or delivery section.`);
      check(html.includes("Kun-Wai-Chay-Backend-Lead-Engineer.pdf"), `${route.pathname} does not use the canonical backend PDF filename.`);
      const imageTags = html.match(/<img\b[^>]*>/gi) ?? [];
    for (const tag of imageTags) {
      check(/alt="[^"]+"/i.test(tag), `${route.pathname} contains an image without meaningful alt text.`);
      check(/width="\d+"/i.test(tag) && /height="\d+"/i.test(tag), `${route.pathname} contains an image without intrinsic dimensions.`);
    }
    const executableScripts = (html.match(/<script(?![^>]*type="application\/ld\+json")[^>]*>/gi) ?? []).length;
    check(executableScripts === 0, `${route.pathname} should render all professional content without JavaScript.`);
  }
}

function hrefsFrom(html) {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/gi)].map((match) => match[1]);
}

async function verifyLinks() {
  const external = new Set();
  for (const route of routes) {
    const html = htmlByRoute.get(route.pathname) ?? "";
    for (const href of hrefsFrom(html)) {
      if (/^(?:mailto|tel):/i.test(href)) {
        check(!/\s/.test(href), `${route.pathname} contains whitespace in ${href}.`);
        continue;
      }
      const resolved = new URL(href, `${BASE_URL}${route.pathname}`);
      if (resolved.origin !== BASE_URL) {
        external.add(resolved.href);
        continue;
      }
      let relative = decodeURIComponent(resolved.pathname).replace(/^\/+/, "");
      if (relative.endsWith("/")) relative += "index.html";
      const target = path.join(ROOT, relative || "index.html");
      check(await exists(target), `${route.pathname} has a missing internal target: ${href}`);
      if (resolved.hash) {
        const targetHtml = await readFile(target, "utf8").catch(() => "");
        const id = decodeURIComponent(resolved.hash.slice(1));
        check(new RegExp(`id=["']${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(targetHtml), `${route.pathname} links to missing fragment ${resolved.hash}.`);
      }
    }
  }

  for (const url of external) {
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 resume-link-checker" },
        signal: AbortSignal.timeout(12000)
      });
      if (response.status === 999) {
        noteWarning(`External host blocked automated validation with status 999: ${url}`);
      } else {
        check(response.status !== 404 && response.status !== 410 && response.status < 500, `External link returned ${response.status}: ${url}`);
      }
    } catch (error) {
      noteWarning(`External link could not be reached from this environment (${url}): ${error.message}`);
    }
  }
}

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
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
  return await exists(candidate) ? candidate : null;
}

async function startServer() {
  const server = createServer(async (request, response) => {
    const filename = await resolveRequestPath(request.url ?? "/");
    if (!filename) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filename).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(await readFile(filename));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function verifyResponsiveAndAccessibility(origin) {
  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 }
  ];
  try {
    for (const route of routes) {
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        const browserErrors = [];
        page.on("pageerror", (error) => browserErrors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") browserErrors.push(message.text());
        });
        const response = await page.goto(`${origin}${route.pathname}`, { waitUntil: "networkidle" });
        check(response?.ok(), `${route.pathname} did not load at ${viewport.width}x${viewport.height}.`);
        await page.evaluate(async () => {
          await Promise.all([...document.images].map((image) => {
            image.scrollIntoView({ block: "center" });
            if (image.complete) return Promise.resolve();
            return new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            });
          }));
          window.scrollTo(0, 0);
        });
        const layout = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          experienceTop: document.getElementById("experience")?.offsetTop ?? null,
          emptyLinks: [...document.querySelectorAll("a")].filter((link) => !(link.textContent ?? "").trim() && !link.getAttribute("aria-label")).length,
          brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length,
          imagesWithoutAlt: [...document.images].filter((image) => !(image.getAttribute("alt") ?? "").trim()).length
        }));
        if (!route.pathname.startsWith("/resume/")) {
          const portrait = await page.locator(".hero-portrait img").evaluate((image) => {
            const rect = image.getBoundingClientRect();
            const style = getComputedStyle(image);
            return {
              naturalWidth: image.naturalWidth,
              naturalHeight: image.naturalHeight,
              width: rect.width,
              height: rect.height,
              aspectRatio: rect.width / rect.height,
              objectFit: style.objectFit
            };
          });
          const expectedRatio = 800 / 990;
          check(portrait.naturalWidth === 800 && portrait.naturalHeight === 990, `${route.pathname} portrait source dimensions changed.`);
          check(Math.abs(portrait.aspectRatio - expectedRatio) < 0.015, `${route.pathname} portrait aspect ratio is ${portrait.aspectRatio.toFixed(3)}, expected ${expectedRatio.toFixed(3)}.`);
          check(portrait.objectFit !== "cover", `${route.pathname} portrait still uses object-fit: cover.`);
          const maximumHeight = viewport.width <= 390 ? 275 : 375;
          check(portrait.height <= maximumHeight, `${route.pathname} portrait is ${Math.round(portrait.height)}px tall at ${viewport.width}px; expected <= ${maximumHeight}px.`);
        }
        if (!route.pathname.startsWith("/resume/")) check(layout.scrollWidth <= layout.viewportWidth + 1, `${route.pathname} has horizontal overflow at ${viewport.width}x${viewport.height}.`);
        check(layout.emptyLinks === 0, `${route.pathname} has an unlabeled link at ${viewport.width}x${viewport.height}.`);
        check(layout.brokenImages === 0, `${route.pathname} has a broken image at ${viewport.width}x${viewport.height}.`);
        check(layout.imagesWithoutAlt === 0, `${route.pathname} has an image without alt text at ${viewport.width}x${viewport.height}.`);
        if (!route.pathname.startsWith("/resume/")) {
          check(layout.experienceTop !== null && layout.experienceTop <= viewport.height * 2, `${route.pathname} experience begins after two screen heights at ${viewport.width}x${viewport.height}.`);
          await page.keyboard.press("Tab");
          const focus = await page.evaluate(() => {
            const active = document.activeElement;
            const style = active ? getComputedStyle(active) : null;
            return { tag: active?.tagName, outlineWidth: style?.outlineWidth, text: active?.textContent?.trim() };
          });
          check(focus.tag === "A" && parseFloat(focus.outlineWidth ?? "0") > 0, `${route.pathname} lacks a visible keyboard focus state.`);
        } else {
          await page.emulateMedia({ media: "print" });
          const sheets = await page.locator(".resume-sheet").evaluateAll((items) => items.map((item) => ({ clientHeight: item.clientHeight, scrollHeight: item.scrollHeight })));
          check(sheets.length === 2, `${route.pathname} must contain two print sheets.`);
          sheets.forEach((sheet, index) => check(sheet.scrollHeight <= sheet.clientHeight + 2, `${route.pathname} page ${index + 1} overflows its print sheet.`));
        }
        check(browserErrors.length === 0, `${route.pathname} emitted browser errors: ${browserErrors.join(" | ")}`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

async function verifyLighthouse(origin) {
  const chrome = await chromeLauncher.launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"]
  });
  try {
    for (const pathname of ["/", "/zh/"]) {
      const result = await lighthouse(`${origin}${pathname}`, {
        port: chrome.port,
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance", "accessibility", "seo"]
      });
      const scores = Object.fromEntries(Object.entries(result.lhr.categories).map(([key, category]) => [key, Math.round(category.score * 100)]));
      console.log(`Lighthouse ${pathname}: performance ${scores.performance}, accessibility ${scores.accessibility}, SEO ${scores.seo}`);
      check(scores.performance >= 90, `${pathname} Lighthouse performance is ${scores.performance}, below 90.`);
      check(scores.accessibility >= 95, `${pathname} Lighthouse accessibility is ${scores.accessibility}, below 95.`);
      check(scores.seo >= 95, `${pathname} Lighthouse SEO is ${scores.seo}, below 95.`);
    }
  } finally {
    await chrome.kill();
  }
}

async function verifyPdf(filename, expectedTitle, language = "en") {
  const fullPath = path.join(ROOT, "assets", "download", filename);
  check(await exists(fullPath), `${filename} is missing.`);
  if (!(await exists(fullPath))) return;
  const info = await stat(fullPath);
  check(info.size < 2 * 1024 * 1024, `${filename} exceeds 2 MB.`);
  const bytes = new Uint8Array(await readFile(fullPath));
  const loadingTask = getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false });
  const pdf = await loadingTask.promise;
  check(pdf.numPages === 2, `${filename} has ${pdf.numPages} pages instead of exactly 2.`);
  const extractedPages = [];
  const urls = new Set();
  let hasStructure = false;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    check(Math.abs(viewport.width - 595.28) < 2 && Math.abs(viewport.height - 841.89) < 2, `${filename} page ${pageNumber} is not A4.`);
    const content = await page.getTextContent();
    extractedPages.push(content.items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim());
    const annotations = await page.getAnnotations();
    annotations.forEach((annotation) => {
      const target = annotation.url ?? annotation.unsafeUrl;
      if (target) urls.add(target);
    });
    const structure = await page.getStructTree();
    if (structure?.children?.length) hasStructure = true;
  }
  const extracted = extractedPages.join(" ");
  const wordCount = extracted.split(/\s+/).filter(Boolean).length;
  console.log(`${filename}: ${pdf.numPages} A4 pages, ${wordCount} extracted words, ${(info.size / 1024).toFixed(0)} KB.`);
  if (language === "zh") {
    const characterCount = extracted.replace(/\s/g, "").length;
    check(characterCount >= 700 && characterCount <= 5000, `${filename} has ${characterCount} extracted Chinese characters; expected a complete two-page resume.`);
  } else {
    check(wordCount >= 620 && wordCount <= 900, `${filename} has ${wordCount} extracted words; expected an approximately 650-850 word resume.`);
  }
  const required = language === "zh"
    ? ["谢官韦（Jacky）", "jackychay@live.com", "美的集团", "后端主导工程师（Technical Lead）", "中国办公室及客户现场", "2024年12月 - 2026年7月", "Swisslog Malaysia Sdn. Bhd.", "马来西亚办公室及区域客户现场", "2020年2月 - 2024年12月", "可接受频繁全球出差", "WhatsApp", "AI 辅助 WMS 故障排查原型", "内部原型 - 尚未发布", "原型 V1", "规划中的 V2", "检索增强生成（RAG）", "只读数据库", "Java", "SQL", "拉曼学院（吉隆坡）"]
    : ["Chay Kun Wai (Jacky)", "jackychay@live.com", "Midea Group", "Backend Lead Engineer (Technical Lead)", "China office and customer sites", "Dec 2024 - Jul 2026", "Swisslog Malaysia Sdn. Bhd.", "Malaysia office and regional customer sites", "Feb 2020 - Dec 2024", "Open to frequent worldwide travel", "WhatsApp", "AI-Assisted WMS Troubleshooting Prototype", "Internal prototype - not released", "Prototype V1", "Planned V2", "retrieval-augmented generation (RAG)", "read-only database", "Java", "SQL", "Tunku Abdul Rahman College"];
  const projectRequired = language === "zh"
    ? ["ManualWarehouse 仓储管理系统", "潜水中心出勤与账单系统", "Angular", "Java EE", "WildFly", "PostgreSQL"]
    : ["ManualWarehouse WMS", "Dive Center Attendance and Billing System", "Angular", "Java EE", "WildFly", "PostgreSQL"];
  for (const requiredText of [...required, ...projectRequired]) {
    check(extracted.includes(requiredText), `${filename} extracted text is missing: ${requiredText}`);
  }
  for (const prohibited of ["QR code", "Date of Birth", "Birth Year", "Age:", "Facebook", "Instagram", "github.com", "production AI", "direct reports", "7+ years", "99.99%"] ) {
    check(!extracted.toLowerCase().includes(prohibited.toLowerCase()), `${filename} contains prohibited content: ${prohibited}`);
  }
  for (const expectedUrl of [
    "mailto:jackychay@live.com",
    "tel:+601111351951",
    "https://www.linkedin.com/in/chay-kun-wai-jacky-75a638233/",
    "https://wa.me/601111351951",
    "https://jacky-chay.github.io/"
  ]) {
    check([...urls].some((url) => url === expectedUrl || url === `${expectedUrl}/`), `${filename} is missing the PDF hyperlink: ${expectedUrl}`);
  }
  check(hasStructure, `${filename} does not expose a tagged structure tree.`);
  const metadata = await pdf.getMetadata();
  check(metadata.info?.Title === expectedTitle, `${filename} has incorrect document title metadata: ${metadata.info?.Title ?? "missing"}`);
  await loadingTask.destroy();
}

async function verifyPdfs() {
  await verifyPdf("Kun-Wai-Chay-Backend-Lead-Engineer.pdf", "Chay Kun Wai (Jacky) - Backend Lead Engineer | Technical Lead");
  await verifyPdf("Kun-Wai-Chay-Forward-Deployed-Engineer.pdf", "Chay Kun Wai (Jacky) - Forward-Deployed Engineer | Technical Lead");
  await verifyPdf("Kun-Wai-Chay-Backend-Lead-Engineer-CN.pdf", "谢官韦（Jacky） - 后端主导工程师 | 技术负责人", "zh");
  await verifyPdf("Kun-Wai-Chay-Forward-Deployed-Engineer-CN.pdf", "谢官韦（Jacky） - 前线部署工程师 | 技术负责人", "zh");
}

await verifyCanonicalAndHtml();
await verifyLinks();
const { server, origin } = await startServer();
try {
  await verifyResponsiveAndAccessibility(origin);
  await verifyLighthouse(origin);
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
await verifyPdfs();

for (const warning of warnings) console.warn(`WARNING: ${warning}`);
if (failures.length) {
  console.error(`\nVerification failed with ${failures.length} issue(s):`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Verification passed${warnings.length ? ` with ${warnings.length} network warning(s)` : ""}.`);
}
