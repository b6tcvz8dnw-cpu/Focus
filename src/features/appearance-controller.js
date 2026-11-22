const THEMES = {
  green: { bg: "#101915", panel: "#19251f", deep: "#111b16", line: "#304138", text: "#edf4ef", muted: "#9eafa4", accent: "#8ec5a3", accent2: "#294b38", tab: "rgba(16,25,21,.96)" },
  blue: { bg: "#101923", panel: "#192838", deep: "#111d29", line: "#30475a", text: "#edf4fb", muted: "#9eafc1", accent: "#8ab9e8", accent2: "#244765", tab: "rgba(16,25,35,.96)" },
  purple: { bg: "#191522", panel: "#251e32", deep: "#1b1726", line: "#443653", text: "#f2edf9", muted: "#b2a5c3", accent: "#b8a0e8", accent2: "#443663", tab: "rgba(25,21,34,.96)" },
  amber: { bg: "#1b1710", panel: "#2a2318", deep: "#201a11", line: "#51432c", text: "#f8f0e2", muted: "#bcae94", accent: "#e7b96f", accent2: "#574323", tab: "rgba(27,23,16,.96)" },
  rose: { bg: "#1b1317", panel: "#2a1d23", deep: "#21171c", line: "#50333d", text: "#f8edf0", muted: "#bea5ad", accent: "#e6a0ad", accent2: "#59323d", tab: "rgba(27,19,23,.96)" }
};
const MARKS = { dot: "●", star: "✦", leaf: "❧" };
const HOME_ICON_SOURCE = "./icons/icon-planet.png";

export function createAppearanceController({ root, storage, onMessage = () => {} }) {
  if (!root || !storage) throw new TypeError("root and storage are required");
  let theme = "green";
  let mark = "dot";
  const listeners = [];
  let iconRenderVersion = 0;
  function renderTheme(name) {
    const palette = THEMES[name];
    const variables = { bg: palette.bg, panel: palette.panel, "surface-deep": palette.deep, line: palette.line, text: palette.text, muted: palette.muted, accent: palette.accent, accent2: palette.accent2, "tab-bg": palette.tab };
    for (const [key, value] of Object.entries(variables)) root.documentElement.style.setProperty("--" + key, value);
    for (const button of root.querySelectorAll("[data-theme]")) {
      const active = button.dataset.theme === name;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    }
    root.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.bg);
    renderHomeIcon(name);
  }
  function hexToRgb(hex) {
    const value = String(hex).replace("#", "");
    return [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16));
  }
  function renderHomeIcon(name) {
    const version = ++iconRenderVersion;
    const ImageCtor = root.defaultView?.Image;
    const preview = root.getElementById("homeIconPreview");
    const appleIcon = root.getElementById("appleTouchIcon");
    const favicon = root.getElementById("appFavicon");
    if (!ImageCtor || !root.createElement || (!preview && !appleIcon && !favicon)) return;
    const palette = THEMES[name];
    const image = new ImageCtor();
    image.onload = () => {
      if (version !== iconRenderVersion) return;
      try {
        const canvas = root.createElement("canvas");
        canvas.width = 192;
        canvas.height = 192;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, 192, 192);
        const pixels = context.getImageData(0, 0, 192, 192);
        const background = hexToRgb(palette.bg);
        const accent = hexToRgb(palette.accent);
        for (let index = 0; index < pixels.data.length; index += 4) {
          if (pixels.data[index + 3] === 0) continue;
          const luminance = (pixels.data[index] * 0.2126 + pixels.data[index + 1] * 0.7152 + pixels.data[index + 2] * 0.0722) / 255;
          const amount = Math.max(0, Math.min(1, (luminance - 0.035) / 0.78));
          pixels.data[index] = Math.round(background[0] * (1 - amount) + accent[0] * amount);
          pixels.data[index + 1] = Math.round(background[1] * (1 - amount) + accent[1] * amount);
          pixels.data[index + 2] = Math.round(background[2] * (1 - amount) + accent[2] * amount);
        }
        context.putImageData(pixels, 0, 0);
        const themedIcon = canvas.toDataURL("image/png");
        if (preview) preview.src = themedIcon;
        if (appleIcon) appleIcon.href = themedIcon;
        if (favicon) favicon.href = themedIcon;
      } catch {
        if (preview) preview.src = HOME_ICON_SOURCE;
      }
    };
    image.onerror = () => {
      if (version === iconRenderVersion && preview) preview.src = HOME_ICON_SOURCE;
    };
    image.src = HOME_ICON_SOURCE;
  }
  function renderMark(name) {
    const brand = root.getElementById("brandMark");
    if (brand) brand.textContent = MARKS[name];
    for (const button of root.querySelectorAll("[data-mark]")) {
      const active = button.dataset.mark === name;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }
  function setTheme(name, { persist = true } = {}) {
    const nextTheme = Object.hasOwn(THEMES, name) ? name : "green";
    if (persist && !storage.setJSON("focus-appearance", { theme: nextTheme, mark })) {
      onMessage("テーマを保存できなかったよ。端末の空き容量やブラウザの状態を確認してね。");
      return false;
    }
    theme = nextTheme; renderTheme(theme); return getState();
  }
  function setMark(name, { persist = true } = {}) {
    const nextMark = Object.hasOwn(MARKS, name) ? name : "dot";
    if (persist && !storage.setText("focus-mark", nextMark)) {
      onMessage("マークを保存できなかったよ。端末の空き容量やブラウザの状態を確認してね。");
      return false;
    }
    mark = nextMark; renderMark(mark); return getState();
  }
  function initialize() {
    const savedAppearance = storage.getJSON("focus-appearance", null);
    theme = Object.hasOwn(THEMES, savedAppearance?.theme) ? savedAppearance.theme : "green";
    const savedMark = storage.getText("focus-mark", "dot");
    mark = Object.hasOwn(MARKS, savedMark) ? savedMark : "dot";
    renderTheme(theme); renderMark(mark);
    for (const button of root.querySelectorAll("[data-theme]")) {
      const handler = () => setTheme(button.dataset.theme);
      button.addEventListener("click", handler); listeners.push([button, handler]);
    }
    for (const button of root.querySelectorAll("[data-mark]")) {
      const handler = () => setMark(button.dataset.mark);
      button.addEventListener("click", handler); listeners.push([button, handler]);
    }
    return getState();
  }
  function getState() { return { theme, mark }; }
  function destroy() {
    for (const [button, handler] of listeners) button.removeEventListener("click", handler);
    listeners.length = 0;
  }
  return { initialize, setTheme, setMark, getState, destroy };
}
