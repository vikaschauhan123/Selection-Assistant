const LANGUAGES = [
  { code: "ar", name: "Arabic" },
  { code: "as", name: "Assamese" },
  { code: "bn", name: "Bengali" },
  { code: "bho", name: "Bhojpuri" },
  { code: "zh-CN", name: "Chinese (Simplified)" },
  { code: "zh-TW", name: "Chinese (Traditional)" },
  { code: "cs", name: "Czech" },
  { code: "da", name: "Danish" },
  { code: "doi", name: "Dogri" },
  { code: "nl", name: "Dutch" },
  { code: "en", name: "English" },
  { code: "fil", name: "Filipino" },
  { code: "fi", name: "Finnish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "el", name: "Greek" },
  { code: "gu", name: "Gujarati" },
  { code: "he", name: "Hebrew" },
  { code: "hi", name: "Hindi" },
  { code: "hu", name: "Hungarian" },
  { code: "id", name: "Indonesian" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "kn", name: "Kannada" },
  { code: "gom", name: "Konkani" },
  { code: "ko", name: "Korean" },
  { code: "mai", name: "Maithili" },
  { code: "ms", name: "Malay" },
  { code: "ml", name: "Malayalam" },
  { code: "mni-Mn", name: "Manipuri (Meiteilon)" },
  { code: "mr", name: "Marathi" },
  { code: "ne", name: "Nepali" },
  { code: "no", name: "Norwegian" },
  { code: "or", name: "Odia" },
  { code: "pl", name: "Polish" },
  { code: "pt", name: "Portuguese" },
  { code: "pa", name: "Punjabi" },
  { code: "ro", name: "Romanian" },
  { code: "ru", name: "Russian" },
  { code: "sa", name: "Sanskrit" },
  { code: "sd", name: "Sindhi" },
  { code: "es", name: "Spanish" },
  { code: "sw", name: "Swahili" },
  { code: "sv", name: "Swedish" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "th", name: "Thai" },
  { code: "tr", name: "Turkish" },
  { code: "uk", name: "Ukrainian" },
  { code: "ur", name: "Urdu" },
  { code: "vi", name: "Vietnamese" },
];

const enabledToggle = document.getElementById("enabledToggle");
const apiKeyInput = document.getElementById("apiKey");
const targetLangInput = document.getElementById("targetLang");
const langSearchInput = document.getElementById("langSearch");
const langListEl = document.getElementById("langList");
const providerHint = document.getElementById("providerHint");
const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("saveBtn");

function detectProvider(key) {
  if (!key) return { provider: null, error: null };
  if (key.startsWith("sk-ant-")) return { provider: "anthropic", error: null };
  if (key.startsWith("sk-")) return { provider: "openai", error: null };
  return { provider: null, error: "Unrecognized API key format. Expected a key starting with \"sk-\" or \"sk-ant-\"." };
}

function updateHint() {
  const key = apiKeyInput.value.trim();
  const { provider, error } = detectProvider(key);

  if (!key) {
    providerHint.textContent = "";
    providerHint.classList.remove("error");
    return;
  }

  if (error) {
    providerHint.textContent = error;
    providerHint.classList.add("error");
  } else {
    providerHint.textContent = "Detected provider: " + (provider === "anthropic" ? "Anthropic" : "OpenAI");
    providerHint.classList.remove("error");
  }
}

function findLanguage(code) {
  return LANGUAGES.find((lang) => lang.code === code);
}

function selectLanguage(lang) {
  targetLangInput.value = lang.code;
  langSearchInput.value = lang.name;
  closeLangList();
}

function closeLangList() {
  langListEl.classList.remove("open");
  langListEl.innerHTML = "";
}

function renderLangList(query) {
  const q = query.trim().toLowerCase();
  // Render every match; the list container has a fixed width/height and
  // scrolls internally so all languages remain reachable without resizing.
  const matches = q
    ? LANGUAGES.filter((lang) => lang.name.toLowerCase().includes(q) || lang.code.toLowerCase().includes(q))
    : LANGUAGES;

  langListEl.innerHTML = "";

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "lang-empty";
    empty.textContent = "No matching language.";
    langListEl.appendChild(empty);
    langListEl.classList.add("open");
    return;
  }

  matches.forEach((lang) => {
    const item = document.createElement("div");
    item.className = "lang-item";
    if (lang.code === targetLangInput.value) item.classList.add("active");
    item.innerHTML = lang.name + '<span class="lang-code">' + lang.code + "</span>";
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectLanguage(lang);
    });
    langListEl.appendChild(item);
  });

  langListEl.classList.add("open");
}

function loadSettings() {
  chrome.storage.sync.get(["apiKey", "targetLang", "enabled"], (settings) => {
    if (settings.apiKey) apiKeyInput.value = settings.apiKey;
    const code = settings.targetLang || "en";
    const lang = findLanguage(code) || LANGUAGES[0];
    targetLangInput.value = lang.code;
    langSearchInput.value = lang.name;
    enabledToggle.checked = settings.enabled !== false;
    updateHint();
  });
}

function saveSettings() {
  const key = apiKeyInput.value.trim();
  const targetLang = targetLangInput.value.trim() || "en";
  const { provider, error } = detectProvider(key);

  if (key && error) {
    providerHint.textContent = error;
    providerHint.classList.add("error");
    statusEl.textContent = "";
    return;
  }

  chrome.storage.sync.set({ apiKey: key, provider, targetLang, enabled: enabledToggle.checked }, () => {
    statusEl.textContent = "Saved.";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 1500);
  });
}

apiKeyInput.addEventListener("input", updateHint);
saveBtn.addEventListener("click", saveSettings);

enabledToggle.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: enabledToggle.checked });
});

langSearchInput.addEventListener("focus", () => renderLangList(langSearchInput.value));
langSearchInput.addEventListener("input", () => renderLangList(langSearchInput.value));
langSearchInput.addEventListener("blur", () => {
  // Delay so a mousedown on a list item can register before the list is closed.
  setTimeout(() => {
    const lang = findLanguage(targetLangInput.value);
    if (lang) langSearchInput.value = lang.name;
    closeLangList();
  }, 100);
});

loadSettings();
