// Content script: detects text selection, shows floating toolbar + result panel.

(function () {
  let toolbarEl = null;
  let panelEl = null;
  let currentSelectionText = "";
  let currentSelectionRect = null;
  let currentSelectionNode = null;
  let isSpeaking = false;
  let toolbarMinimized = false;
  let toolbarDragPosition = null;
  let extensionEnabled = true;

  try {
    chrome.storage.sync.get(["enabled"], (settings) => {
      extensionEnabled = settings.enabled !== false;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.enabled) {
        extensionEnabled = changes.enabled.newValue !== false;
        if (!extensionEnabled) removeAll();
      }
    });
  } catch (e) {
    // Extension context not available yet (or invalidated) — keep the default enabled state.
  }

  function isTransparentColor(color) {
    return !color || color === "transparent" || /rgba?\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(color);
  }

  function getEffectiveBackground(node) {
    let el = node && node.nodeType === 1 ? node : node && node.parentElement;
    while (el && el !== document.documentElement) {
      const bg = window.getComputedStyle(el).backgroundColor;
      if (!isTransparentColor(bg)) return bg;
      el = el.parentElement;
    }
    const bodyBg = document.body && window.getComputedStyle(document.body).backgroundColor;
    if (!isTransparentColor(bodyBg)) return bodyBg;
    return window.getComputedStyle(document.documentElement).backgroundColor || "rgb(255, 255, 255)";
  }

  function isPageDark(node) {
    try {
      const color = getEffectiveBackground(node);
      const nums = color.match(/[\d.]+/g);
      if (!nums || nums.length < 3) return false;
      const [r, g, b] = nums.map(Number);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance < 0.5;
    } catch (e) {
      return false;
    }
  }

  const BASE_RATE = 0.92;
  const SPEED_PRESETS = [0.75, 1, 1.25, 1.5, 2];
  let speedMultiplier = 1;

  function cycleSpeed() {
    const idx = SPEED_PRESETS.indexOf(speedMultiplier);
    speedMultiplier = SPEED_PRESETS[(idx + 1) % SPEED_PRESETS.length];
    return speedMultiplier;
  }

  const WORD_REGEX = /^[A-Za-z][A-Za-z'-]*$/;

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const success = document.execCommand("copy");
        document.body.removeChild(textarea);
        success ? resolve() : reject(new Error("execCommand failed"));
      } catch (e) {
        reject(e);
      }
    });
  }

  // Preferred soft-sounding voices, checked in order across platforms/browsers.
  const SOFT_VOICE_NAMES = [
    "Samantha", // macOS/iOS
    "Google UK English Female",
    "Google US English",
    "Microsoft Aria Online (Natural) - English (United States)",
    "Microsoft Jenny Online (Natural) - English (United States)",
    "Microsoft Zira Desktop - English (United States)",
    "Karen", // macOS (Australia)
    "Moira", // macOS (Ireland)
    "Tessa", // macOS (South Africa)
    "Victoria",
  ];

  let cachedVoices = [];
  function refreshVoices() {
    cachedVoices = window.speechSynthesis.getVoices();
  }
  refreshVoices();
  if ("onvoiceschanged" in window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }

  function getSoftVoice() {
    if (!cachedVoices.length) refreshVoices();
    if (!cachedVoices.length) return null;

    for (const name of SOFT_VOICE_NAMES) {
      const match = cachedVoices.find((v) => v.name === name);
      if (match) return match;
    }
    const femaleMatch = cachedVoices.find((v) => /female/i.test(v.name));
    if (femaleMatch) return femaleMatch;

    return null;
  }

  function removeToolbar() {
    if (toolbarEl) {
      toolbarEl.remove();
      toolbarEl = null;
    }
  }

  function removePanel() {
    if (panelEl) {
      panelEl.remove();
      panelEl = null;
    }
  }

  function removeAll() {
    removeToolbar();
    removePanel();
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
    }
  }

  function applyClampedBounds(el, elRect, top, left) {
    const margin = 8;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    const minTop = window.scrollY + margin;
    const maxTop = window.scrollY + viewportHeight - elRect.height - margin;
    if (top < minTop) top = minTop;
    if (maxTop > minTop && top > maxTop) top = maxTop;

    const minLeft = window.scrollX + margin;
    const maxLeft = window.scrollX + viewportWidth - elRect.width - margin;
    if (left < minLeft) left = minLeft;
    if (maxLeft > minLeft && left > maxLeft) left = maxLeft;

    el.style.top = top + "px";
    el.style.left = left + "px";
  }

  function clampToViewport(el, rect) {
    const margin = 8;

    document.body.appendChild(el);
    const elRect = el.getBoundingClientRect();

    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    // Vertical: place below the selection if there's more (or enough) room below;
    // otherwise flip and place above it. Selections near the bottom of the
    // viewport get the panel above them, selections near the top get it below.
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    let top;
    if (spaceBelow >= elRect.height + margin || spaceBelow >= spaceAbove) {
      top = rect.bottom + window.scrollY + margin;
    } else {
      top = rect.top + window.scrollY - elRect.height - margin;
    }

    // Horizontal: align the panel's left edge with the selection's left edge if
    // there's enough room to its right; otherwise anchor the panel's right edge
    // to the selection's right edge instead, so it grows leftward. Selections
    // near the right edge of the viewport get the panel shifted left, and vice versa.
    const spaceRight = viewportWidth - rect.left;
    const spaceLeft = rect.right;
    let left;
    if (spaceRight >= elRect.width + margin || spaceRight >= spaceLeft) {
      left = rect.left + window.scrollX;
    } else {
      left = rect.right + window.scrollX - elRect.width;
    }

    applyClampedBounds(el, elRect, top, left);
  }

  function positionAtSaved(el, pos) {
    document.body.appendChild(el);
    const elRect = el.getBoundingClientRect();
    applyClampedBounds(el, elRect, pos.top, pos.left);
  }

  function buildToolbarButton(icon, label, onClick) {
    const btn = document.createElement("button");
    btn.className = "sa-btn";
    btn.type = "button";
    btn.title = label;
    btn.innerHTML = '<span class="sa-icon">' + icon + "</span><span class=\"sa-label\">" + label + "</span>";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  function makeDraggable(handle, el) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startTop = 0;
    let startLeft = 0;

    function onMove(e) {
      if (!dragging) return;
      el.style.left = startLeft + (e.clientX - startX) + "px";
      el.style.top = startTop + (e.clientY - startY) + "px";
    }

    function onUp() {
      dragging = false;
      el.classList.remove("sa-dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      toolbarDragPosition = {
        top: parseFloat(el.style.top) || 0,
        left: parseFloat(el.style.left) || 0,
      };
    }

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const elRect = el.getBoundingClientRect();
      // el.style.top/left are document-relative (matching clampToViewport's convention),
      // while getBoundingClientRect() is viewport-relative — convert with the scroll offset.
      startTop = elRect.top + window.scrollY;
      startLeft = elRect.left + window.scrollX;
      el.classList.add("sa-dragging");
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function showToolbar(rect, text) {
    removeToolbar();
    removePanel();

    const toolbar = document.createElement("div");
    toolbar.className =
      "sa-toolbar" +
      (isPageDark(currentSelectionNode) ? " sa-toolbar-inverted" : "") +
      (toolbarMinimized ? " sa-toolbar-minimized" : "");

    const dragHandle = document.createElement("span");
    dragHandle.className = "sa-drag-handle";
    dragHandle.title = "Drag to move";
    dragHandle.setAttribute("aria-hidden", "true");
    dragHandle.textContent = "✛";
    toolbar.appendChild(dragHandle);
    makeDraggable(dragHandle, toolbar);

    const buttons = document.createElement("div");
    buttons.className = "sa-toolbar-buttons";

    buttons.appendChild(buildToolbarButton("🔊", "Read", () => toggleReadAloud(text)));

    const speedBtn = buildToolbarButton("⏱", speedMultiplier + "x", () => {
      cycleSpeed();
      const labelEl = speedBtn.querySelector(".sa-label");
      if (labelEl) labelEl.textContent = speedMultiplier + "x";
      speedBtn.title = "Playback speed: " + speedMultiplier + "x";
      if (isSpeaking) {
        window.speechSynthesis.cancel();
        isSpeaking = false;
        toggleReadAloud(text);
      }
    });
    speedBtn.title = "Playback speed: " + speedMultiplier + "x";
    buttons.appendChild(speedBtn);

    const copyBtn = buildToolbarButton("📋", "Copy", () => {
      const iconEl = copyBtn.querySelector(".sa-icon");
      const labelEl = copyBtn.querySelector(".sa-label");
      copyToClipboard(text)
        .then(() => {
          if (iconEl) iconEl.textContent = "✅";
          if (labelEl) labelEl.textContent = "Copied!";
          copyBtn.title = "Copied!";
          setTimeout(() => {
            if (iconEl) iconEl.textContent = "📋";
            if (labelEl) labelEl.textContent = "Copy";
            copyBtn.title = "Copy";
          }, 1200);
        })
        .catch(() => {
          if (iconEl) iconEl.textContent = "⚠️";
          if (labelEl) labelEl.textContent = "Failed";
          copyBtn.title = "Copy failed";
          setTimeout(() => {
            if (iconEl) iconEl.textContent = "📋";
            if (labelEl) labelEl.textContent = "Copy";
            copyBtn.title = "Copy";
          }, 1200);
        });
    });
    buttons.appendChild(copyBtn);

    buttons.appendChild(
      buildToolbarButton("✨", "Rephrase", () => handleAction("rephrase", text, "Rephrasing..."))
    );

    buttons.appendChild(
      buildToolbarButton("🌐", "Translate", () => handleAction("translate", text, "Translating..."))
    );

    const trimmed = text.trim();
    if (WORD_REGEX.test(trimmed)) {
      buttons.appendChild(
        buildToolbarButton("📖", "Define", () => handleAction("define", trimmed, "Looking up definition..."))
      );
    }

    toolbar.appendChild(buttons);

    const minimizeBtn = document.createElement("button");
    minimizeBtn.className = "sa-minimize-btn";
    minimizeBtn.type = "button";
    minimizeBtn.textContent = toolbarMinimized ? "⋯" : "−";
    minimizeBtn.title = toolbarMinimized ? "Expand toolbar" : "Minimize toolbar";
    minimizeBtn.setAttribute("aria-label", minimizeBtn.title);
    minimizeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toolbarMinimized = toolbar.classList.toggle("sa-toolbar-minimized");
      minimizeBtn.textContent = toolbarMinimized ? "⋯" : "−";
      minimizeBtn.title = toolbarMinimized ? "Expand toolbar" : "Minimize toolbar";
      minimizeBtn.setAttribute("aria-label", minimizeBtn.title);
    });
    toolbar.appendChild(minimizeBtn);

    toolbar.addEventListener("mousedown", (e) => e.stopPropagation());

    if (toolbarDragPosition) {
      positionAtSaved(toolbar, toolbarDragPosition);
    } else {
      clampToViewport(toolbar, rect);
    }
    toolbarEl = toolbar;
  }

  function showPanel(rect, contentText, isError) {
    removePanel();

    const panel = document.createElement("div");
    panel.className =
      "sa-panel" + (isError ? " sa-panel-error" : "") + (isPageDark(currentSelectionNode) ? "" : " sa-panel-inverted");

    const body = document.createElement("div");
    body.className = "sa-panel-body";
    body.textContent = contentText;
    panel.appendChild(body);

    if (!isError) {
      const copyBtn = document.createElement("button");
      copyBtn.className = "sa-copy-icon-btn";
      copyBtn.type = "button";
      copyBtn.title = "Copy to clipboard";
      copyBtn.setAttribute("aria-label", "Copy to clipboard");
      copyBtn.textContent = "📋";
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        copyToClipboard(contentText)
          .then(() => {
            copyBtn.textContent = "✅";
            setTimeout(() => {
              copyBtn.textContent = "📋";
            }, 1200);
          })
          .catch(() => {
            copyBtn.textContent = "⚠️";
            setTimeout(() => {
              copyBtn.textContent = "📋";
            }, 1200);
          });
      });
      panel.appendChild(copyBtn);
    }

    const closeBtn = document.createElement("button");
    closeBtn.className = "sa-panel-close";
    closeBtn.type = "button";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removePanel();
    });
    panel.appendChild(closeBtn);

    panel.addEventListener("mousedown", (e) => e.stopPropagation());

    clampToViewport(panel, rect);
    panelEl = panel;
  }

  function showApiKeyGuidancePanel(rect) {
    removePanel();

    const panel = document.createElement("div");
    panel.className = "sa-panel" + (isPageDark(currentSelectionNode) ? "" : " sa-panel-inverted");

    const body = document.createElement("div");
    body.className = "sa-panel-body sa-apikey-guidance";
    // Static, developer-authored markup only — no interpolated/external data — safe to set via innerHTML.
    body.innerHTML =
      "<p>Add your API key in the extension's settings popup first.</p>" +
      '<p class="sa-supported-label">Supported AI tools:</p>' +
      '<ul class="sa-supported-list">' +
      '<li>OpenAI (GPT) — <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">Get an API key</a></li>' +
      '<li>Anthropic (Claude) — <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">Get an API key</a></li>' +
      "</ul>" +
      "<p>Then click the Selection Assistant icon in your toolbar and paste it into the API Key field.</p>";
    panel.appendChild(body);

    const closeBtn = document.createElement("button");
    closeBtn.className = "sa-panel-close";
    closeBtn.type = "button";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removePanel();
    });
    panel.appendChild(closeBtn);

    panel.addEventListener("mousedown", (e) => e.stopPropagation());

    clampToViewport(panel, rect);
    panelEl = panel;
  }

  function showLoadingPanel(rect, loadingText) {
    showPanel(rect, loadingText, false);
  }

  function toggleReadAloud(text) {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const softVoice = getSoftVoice();
    if (softVoice) utterance.voice = softVoice;
    utterance.rate = BASE_RATE * speedMultiplier;
    utterance.pitch = 1.05;
    utterance.volume = 1;
    utterance.onend = () => {
      isSpeaking = false;
    };
    utterance.onerror = () => {
      isSpeaking = false;
    };
    isSpeaking = true;
    window.speechSynthesis.speak(utterance);
  }

  const RELOAD_NEEDED_MESSAGE =
    "This extension was updated or reloaded. Please refresh this page to keep using Selection Assistant.";

  function isExtensionContextValid() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function handleAction(action, text, loadingText) {
    if (!currentSelectionRect) return;

    if (!isExtensionContextValid()) {
      showPanel(currentSelectionRect, RELOAD_NEEDED_MESSAGE, true);
      return;
    }

    showLoadingPanel(currentSelectionRect, loadingText);

    const payload = { action, text };
    if (action === "translate") {
      try {
        chrome.storage.sync.get(["targetLang"], (settings) => {
          if (!isExtensionContextValid()) {
            showPanel(currentSelectionRect, RELOAD_NEEDED_MESSAGE, true);
            return;
          }
          payload.targetLang = (settings && settings.targetLang) || "en";
          sendAction(payload);
        });
      } catch (e) {
        showPanel(currentSelectionRect, RELOAD_NEEDED_MESSAGE, true);
      }
    } else {
      sendAction(payload);
    }
  }

  function sendAction(payload) {
    try {
      chrome.runtime.sendMessage(payload, (response) => {
        if (!isExtensionContextValid()) {
          showPanel(currentSelectionRect, RELOAD_NEEDED_MESSAGE, true);
          return;
        }
        if (chrome.runtime.lastError) {
          showPanel(currentSelectionRect, "Error: " + chrome.runtime.lastError.message, true);
          return;
        }
        if (!response) {
          showPanel(currentSelectionRect, "Error: no response from extension background.", true);
          return;
        }
        if (response.ok) {
          showPanel(currentSelectionRect, response.result, false);
        } else if (response.code === "NO_API_KEY") {
          showApiKeyGuidancePanel(currentSelectionRect);
        } else {
          showPanel(currentSelectionRect, response.error || "Unknown error occurred.", true);
        }
      });
    } catch (e) {
      showPanel(currentSelectionRect, RELOAD_NEEDED_MESSAGE, true);
    }
  }

  function onMouseUp(e) {
    if (!extensionEnabled) return;

    // Ignore clicks inside our own UI.
    if ((toolbarEl && toolbarEl.contains(e.target)) || (panelEl && panelEl.contains(e.target))) {
      return;
    }

    setTimeout(() => {
      if (!extensionEnabled) return;

      const selection = window.getSelection();
      const text = selection ? selection.toString().trim() : "";

      if (!text) {
        removeAll();
        return;
      }

      if (text === currentSelectionText && toolbarEl) {
        return;
      }

      removeAll();

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        return;
      }

      currentSelectionText = text;
      currentSelectionRect = rect;
      currentSelectionNode = range.commonAncestorContainer;
      showToolbar(rect, text);
    }, 0);
  }

  function onMouseDown(e) {
    if ((toolbarEl && toolbarEl.contains(e.target)) || (panelEl && panelEl.contains(e.target))) {
      return;
    }
    // A new mousedown outside our UI means a new selection is starting (or a plain click) — dismiss.
    removeAll();
    currentSelectionText = "";
    currentSelectionRect = null;
    currentSelectionNode = null;
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      removeAll();
    }
  }

  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("keydown", onKeyDown, true);
})();
