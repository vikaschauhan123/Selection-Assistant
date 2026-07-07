// Background service worker: handles all network calls so page CSP can't block them.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return false;

  switch (message.action) {
    case "translate":
      handleTranslate(message.text, message.targetLang)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err) => sendResponse({ ok: false, error: err.message, code: err.code }));
      return true; // async response

    case "define":
      handleDefine(message.text)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err) => sendResponse({ ok: false, error: err.message, code: err.code }));
      return true;

    case "rephrase":
      handleRephrase(message.text)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err) => sendResponse({ ok: false, error: err.message, code: err.code }));
      return true;

    default:
      return false;
  }
});

// ---------- Translate (Google Translate free endpoint) ----------

async function handleTranslate(text, targetLang) {
  const lang = (targetLang || "en").trim() || "en";
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" +
    encodeURIComponent(lang) +
    "&dt=t&q=" +
    encodeURIComponent(text);

  let response;
  try {
    response = await fetch(url);
  } catch (e) {
    throw new Error("Network error while contacting Google Translate: " + e.message);
  }

  if (!response.ok) {
    throw new Error("Google Translate request failed (HTTP " + response.status + ").");
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error("Could not parse the translation response.");
  }

  try {
    const translated = data[0].map((chunk) => chunk[0]).join("");
    if (!translated) throw new Error("empty");
    return translated;
  } catch (e) {
    throw new Error("Unexpected response format from Google Translate.");
  }
}

// ---------- Define (free Dictionary API) ----------

async function handleDefine(word) {
  const url = "https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word);

  let response;
  try {
    response = await fetch(url);
  } catch (e) {
    throw new Error("Network error while contacting the dictionary service: " + e.message);
  }

  if (response.status === 404) {
    throw new Error('No definition found for "' + word + '".');
  }
  if (!response.ok) {
    throw new Error("Dictionary lookup failed (HTTP " + response.status + ").");
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error("Could not parse the dictionary response.");
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No definition found for "' + word + '".');
  }

  const lines = [];
  for (const entry of data) {
    if (!entry.meanings) continue;
    for (const meaning of entry.meanings) {
      const pos = meaning.partOfSpeech || "";
      lines.push(pos ? "(" + pos + ")" : "");
      const defs = (meaning.definitions || []).slice(0, 3);
      defs.forEach((d, i) => {
        lines.push((i + 1) + ". " + d.definition);
      });
      lines.push("");
    }
  }

  const result = lines.join("\n").trim();
  if (!result) {
    throw new Error('No definition found for "' + word + '".');
  }
  return result;
}

// ---------- Rephrase (OpenAI or Anthropic, based on saved key) ----------

function noApiKeyError() {
  const err = new Error("Add your API key in the extension's settings popup first.");
  err.code = "NO_API_KEY";
  return err;
}

async function handleRephrase(text) {
  const { apiKey, provider } = await chrome.storage.sync.get(["apiKey", "provider"]);

  if (!apiKey) {
    throw noApiKeyError();
  }

  if (provider === "anthropic") {
    return rephraseWithAnthropic(text, apiKey);
  }
  if (provider === "openai") {
    return rephraseWithOpenAI(text, apiKey);
  }
  throw noApiKeyError();
}

async function rephraseWithOpenAI(text, apiKey) {
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You rephrase text to be clearer and better written. Return only the rephrased text, no preamble.",
          },
          { role: "user", content: text },
        ],
        temperature: 0.7,
      }),
    });
  } catch (e) {
    throw new Error("Network error while contacting OpenAI: " + e.message);
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error("Could not parse OpenAI's response.");
  }

  if (!response.ok) {
    const errCode = data && data.error && data.error.code;
    const errType = data && data.error && data.error.type;
    if (response.status === 429 || errCode === "insufficient_quota" || errType === "insufficient_quota") {
      throw new Error("Your OpenAI API key has run out of credits/quota. Add credits or use a different key.");
    }
    const msg = (data && data.error && data.error.message) || "HTTP " + response.status;
    throw new Error("OpenAI error: " + msg);
  }

  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) {
    throw new Error("OpenAI returned an unexpected response format.");
  }
  return content.trim();
}

async function rephraseWithAnthropic(text, apiKey) {
  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        system: "You rephrase text to be clearer and better written. Return only the rephrased text, no preamble.",
        messages: [{ role: "user", content: text }],
      }),
    });
  } catch (e) {
    throw new Error("Network error while contacting Anthropic: " + e.message);
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error("Could not parse Anthropic's response.");
  }

  if (!response.ok) {
    const errType = data && data.error && data.error.type;
    const errMsg = (data && data.error && data.error.message) || "";

    if (response.status === 429 || errType === "rate_limit_error") {
      throw new Error("Your Anthropic API key has hit its rate/usage limit. Check your plan or add credits.");
    }
    if (errType === "invalid_request_error" && /credit/i.test(errMsg)) {
      throw new Error("Your Anthropic account is out of credits. Add credits to keep using Rephrase.");
    }
    throw new Error("Anthropic error: " + (errMsg || "HTTP " + response.status));
  }

  const content =
    data &&
    data.content &&
    data.content[0] &&
    data.content[0].text;
  if (!content) {
    throw new Error("Anthropic returned an unexpected response format.");
  }
  return content.trim();
}
