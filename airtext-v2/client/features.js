import { zipSync } from "fflate";

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function button(label, action, extraClass) {
  const element = node("button", label, extraClass ? `action-btn ${extraClass}` : "action-btn");
  element.type = "button";
  element.addEventListener("click", action);
  return element;
}
export function tierBadge(sharedBy) {
  if (!sharedBy || !sharedBy.name) return null;
  const rank = Number(sharedBy.rank);
  const cls = rank === 0 ? "tier-badge-admin" : rank === 1 ? "tier-badge-pro" : "tier-badge-member";
  const icon = rank === 0 ? "\u{1F451}" : rank === 1 ? "★" : "●";
  return node("span", `${icon} ${sharedBy.name}`, `tier-badge ${cls}`);
}

export function looksLikeCode(raw) {
  if (typeof raw !== "string") return false;
  const text = raw.trim();
  if (!text) return false;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return true;
  } catch { /* Not JSON. */ }
  if (/^```|^#!\/usr\/|^#!\/bin\//.test(text)) return true;
  if (/^<[a-zA-Z!/?][\s\S]*>[ \t]*$/.test(text) && /<\/[a-zA-Z]/.test(text)) return true;
  if (/(?:^|\n)\s*(?:function\s+\w*|const\s+\w+|let\s+\w+|var\s+\w+|import\s+[\s\S]+?from\s+|export\s+(?:default|const|function|class)|class\s+\w+|interface\s+\w+|def\s+\w+\s*\(|#include\s*[<"]|package\s+\w+|public\s+(?:class|static|void)|SELECT\s+[\s\S]+?\s+FROM\s+)/i.test(text)) {
    return true;
  }
  const lines = text.split(/\r?\n/);
  if (lines.length >= 2) {
    const indented = lines.filter((line) => /^(?:  |\t)\S/.test(line)).length;
    const codeEndings = lines.filter((line) => /[{}();,]\s*$/.test(line)).length;
    if (indented >= 2 || codeEndings >= 2) return true;
  }
  if (/[{};]/.test(text) && /\b(?:function|return|const|let|var|if|else|for|while)\b/.test(text)) return true;
  return false;
}

function dedentLines(lines) {
  let minIndent = Infinity;
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^[ ]*/);
    if (match && match[0].length < minIndent) minIndent = match[0].length;
  }
  if (!Number.isFinite(minIndent) || minIndent <= 0) return lines;
  return lines.map((line) => (line.trim() ? line.slice(minIndent) : ""));
}

function formatBraceCode(text) {
  const expanded = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let parenDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : "";
    if (ch === "'" && !inDouble && !inTemplate && prev !== "\\") inSingle = !inSingle;
    else if (ch === '"' && !inSingle && !inTemplate && prev !== "\\") inDouble = !inDouble;
    else if (ch === "`" && !inSingle && !inDouble && prev !== "\\") inTemplate = !inTemplate;

    if (!inSingle && !inDouble && !inTemplate) {
      if (ch === "(") parenDepth++;
      else if (ch === ")" && parenDepth > 0) parenDepth--;

      if (ch === "{") {
        current = current.replace(/[ ]+$/, "");
        expanded.push(current ? `${current} {` : "{");
        current = "";
        continue;
      }
      if (ch === "}") {
        if (current.trim()) expanded.push(current.trim());
        current = "}";
        if (text[i + 1] === ";" || text[i + 1] === ",") {
          current += text[i + 1];
          i++;
        }
        expanded.push(current);
        current = "";
        continue;
      }
      if (ch === ";" && parenDepth === 0) {
        current += ";";
        expanded.push(current.trim());
        current = "";
        continue;
      }
      if (ch === "\n") {
        expanded.push(current.replace(/[ ]+$/, ""));
        current = "";
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) expanded.push(current.replace(/[ ]+$/, ""));

  let depth = 0;
  const out = [];
  for (const rawLine of expanded) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    if (/^[}\])]/.test(trimmed)) depth = Math.max(0, depth - 1);
    out.push("  ".repeat(depth) + trimmed);
    const opens = (trimmed.match(/[{[(]/g) || []).length;
    const closes = (trimmed.match(/[}\])]/g) || []).length;
    const net = opens - closes + (/^[}\])]/.test(trimmed) ? 1 : 0);
    depth = Math.max(0, depth + net);
  }
  return out.join("\n").trim();
}

function formatMarkupCode(text) {
  const tokens = text
    .replace(/>\s+</g, ">\n<")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let depth = 0;
  const out = [];
  for (const token of tokens) {
    const isClosing = /^<\//.test(token);
    const isSelfClosing = /\/>$/.test(token) || /^<(?:!|meta|link|img|br|hr|input)\b/i.test(token) || /<([a-zA-Z0-9-]+)[^>]*>.*<\/\1>$/.test(token);
    if (isClosing) depth = Math.max(0, depth - 1);
    out.push("  ".repeat(depth) + token);
    if (!isClosing && !isSelfClosing && /^<[a-zA-Z]/.test(token)) depth++;
  }
  return out.join("\n");
}

export function formatCodeText(raw) {
  if (typeof raw !== "string") return "";
  let text = raw.replace(/\r\n?/g, "\n").replace(/\t/g, "  ").trim();
  if (!text) return "";

  const fenceMatch = text.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
  if (fenceMatch) text = fenceMatch[1].trim();

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return JSON.stringify(parsed, null, 2);
    }
  } catch { /* Continue with general code formatting. */ }

  if (/^<[a-zA-Z!/?][\s\S]*>$/.test(text) && /<\/[a-zA-Z]/.test(text)) {
    return formatMarkupCode(text);
  }

  const lines = text.split("\n").map((line) => line.replace(/[ ]+$/, ""));
  if (lines.length <= 2 && /[{}]/.test(text)) {
    return formatBraceCode(text);
  }

  if (/[{}]/.test(text)) {
    let depth = 0;
    const formatted = [];
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        if (formatted.length && formatted[formatted.length - 1] !== "") formatted.push("");
        continue;
      }
      if (/^[}\])]/.test(trimmed)) depth = Math.max(0, depth - 1);
      formatted.push("  ".repeat(depth) + trimmed);
      const opens = (trimmed.match(/[{[(]/g) || []).length;
      const closes = (trimmed.match(/[}\])]/g) || []).length;
      const net = opens - closes + (/^[}\])]/.test(trimmed) ? 1 : 0);
      depth = Math.max(0, depth + net);
    }
    return formatted.join("\n").trim();
  }

  return dedentLines(lines).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function rememberDrop(kind, drop) {
  if (drop && drop.sharedBy) return;
  try {
    const entries = recentDrops().filter((item) => item.id !== drop.id);
    entries.unshift({ kind, id: drop.id, title: drop.title, code: drop.code, expiresAt: drop.expiresAt, burnAfterRead: drop.burnAfterRead });
    localStorage.setItem("airtext_recent_drops", JSON.stringify(entries.slice(0, 50)));
  } catch { /* Sharing still succeeds when browser storage is unavailable. */ }
}
export function recentDrops() {
  try {
    const entries = JSON.parse(localStorage.getItem("airtext_recent_drops") || "[]");
    const valid = Array.isArray(entries) ? entries.filter((item) => item && ["note", "file"].includes(item.kind) && typeof item.id === "string" && item.expiresAt > Date.now()) : [];
    if (Array.isArray(entries) && valid.length !== entries.length) localStorage.setItem("airtext_recent_drops", JSON.stringify(valid));
    return valid;
  } catch { return []; }
}
export function forgetDrop(id) {
  try { localStorage.setItem("airtext_recent_drops", JSON.stringify(recentDrops().filter((item) => item.id !== id))); } catch { /* Optional history. */ }
}
export function renderRecentDrops(actions) {
  const target = document.getElementById("recent-drops");
  if (!target) return;
  const entries = recentDrops().filter((item) => actions.owns(item.kind, item.id));
  target.replaceChildren();
  target.hidden = !entries.length;
  if (!entries.length) return;
  const details = node("details", null, "recent-drop-tray");
  details.append(node("summary", `Your recent drops on this browser (${entries.length})`));
  details.append(node("p", "Saved on this browser only. Clearing browser data removes this history.", "feature-hint"));
  for (const item of entries) {
    const row = node("article", null, "note-row");
    const info = node("div", null, "note-main");
    const meta = node("div", null, "note-meta");
    meta.append(
      node("span", item.kind === "file" ? "Files" : "Text", "note-badge"),
      node("span", "Mine", "note-badge badge-mine"),
      node("span", item.code, "note-badge")
    );
    if (item.burnAfterRead) meta.append(node("span", "Open once", "note-badge badge-burn"));
    const title = button(item.title || "Untitled", () => actions.open(item.kind, item.id));
    title.className = "drop-title-button";
    const expiry = node("span", actions.remaining ? actions.remaining(item.expiresAt) : `${item.kind === "file" ? "Files" : "Text"} · ${item.code}`, "note-expiry");
    if (item.expiresAt) expiry.dataset.expires = String(item.expiresAt);
    info.append(meta, title, expiry);
    const controls = node("div", null, "note-actions");
    const delBtn = button("Delete", () => actions.remove(item));
    delBtn.dataset.action = "delete-recent-drop";
    controls.append(
      button("Open", () => actions.open(item.kind, item.id), "primary-action"),
      button("Copy link", () => actions.copy(item)),
      button("QR", () => actions.qr(item)),
      button("Edit", () => actions.edit(item.kind, item.id)),
      delBtn
    );
    row.append(info, controls);
    details.append(row);
  }
  target.append(details);
}

export function renderNearbyBoard(items, files, actions) {
  const list = document.getElementById("nearby-drop-list");
  if (!list) return;
  const query = (document.getElementById("nearby-search").value || "").trim().toLowerCase();
  const filter = document.querySelector("[data-nearby-filter][aria-pressed=true]")?.dataset.nearbyFilter || "all";
  const entries = [...items.map((item) => ({ ...item, kind: "note" })), ...files.map((item) => ({ ...item, kind: "file" }))].filter((item) => !item.burnAfterRead && item.expiresAt > Date.now()).sort((a, b) => (b.addedAt || b.createdAt) - (a.addedAt || a.createdAt));
  document.getElementById("nearby-total").textContent = `${entries.length} active drops`;
  const isOwnedEntry = (item) => item.sharedBy ? Boolean(item.isOwner) : Boolean(item.isOwner || actions.owns(item.kind, item.id));
  const shown = entries.filter((item) => (!query || `${item.title} ${item.code}`.toLowerCase().includes(query)) && (filter === "all" || filter === item.kind || (filter === "mine" && isOwnedEntry(item)) || (filter === "open" && !item.locked) || (filter === "locked" && item.locked)));
  list.replaceChildren();
  if (!shown.length) { list.append(node("p", entries.length ? "No drops match this view." : "No nearby drops yet. Share something to get started.", "nearby-empty")); return; }
  for (const item of shown) {
    const isMine = isOwnedEntry(item);
    const row = node("article", null, `note-row${item.sharedBy?.rank === 0 ? " tier-card-admin" : ""}`);
    const info = node("div", null, "note-main");
    const meta = node("div", null, "note-meta");
    meta.append(
      node("span", item.kind === "file" ? "Files" : "Text", "note-badge"),
      node("span", isMine ? "Mine" : "Nearby", `note-badge ${isMine ? "badge-mine" : "badge-received"}`),
      node("span", item.locked ? "PIN locked" : "Open", `note-badge${item.locked ? " badge-locked" : ""}`)
    );
    if (item.burnAfterRead) meta.append(node("span", "Open once", "note-badge badge-burn"));
    if (item.sharedBy) {
      const badge = tierBadge(item.sharedBy);
      if (badge) meta.append(badge);
    }
    const title = button(item.title, () => actions.openNearby(item.kind, item.id));
    title.className = "drop-title-button";
    const expiry = node("span", actions.remaining(item.expiresAt), "note-expiry");
    expiry.dataset.expires = String(item.expiresAt);
    info.append(meta, title, expiry);
    const controls = node("div", null, "note-actions");
    controls.append(button("Open", () => actions.openNearby(item.kind, item.id), "primary-action"));
    if (item.kind === "note" && !item.locked) controls.append(button("Copy text", () => actions.copyNearby(item.id)));
    controls.append(button("QR", () => actions.qr(item)));
    row.append(info, controls);
    list.append(row);
  }
}

export function addSmartTools(container, text, copy, toast) {
  document.getElementById("smart-text-tools")?.remove();
  const tools = node("div", null, "smart-tools");
  tools.id = "smart-text-tools";
  const trimmed = text.trim();
  try {
    const url = new URL(trimmed);
    if (/^https?:$/.test(url.protocol) && !/\s/.test(trimmed)) {
      const link = node("a", "Open link ↗", "action-btn");
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      tools.append(link);
    }
  } catch { /* Most notes are not URLs. */ }
  const codes = [...new Set(text.match(/\b\d{4,8}\b/g) || [])];
  if (codes.length === 1) tools.append(button(`Copy code ${codes[0]}`, () => copy(codes[0], "Code copied.")));

  const isCode = looksLikeCode(text);
  container.classList.toggle("code-view", isCode);
  const labelEl = document.querySelector(".modal-text-label");
  if (labelEl) labelEl.textContent = isCode ? "Code" : "Text";

  const monoBtn = button("Monospace", (event) => {
    const active = container.classList.toggle("code-view");
    event.currentTarget.setAttribute("aria-pressed", String(active));
  });
  monoBtn.setAttribute("aria-pressed", String(isCode));
  tools.append(monoBtn);

  let json = null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") json = JSON.stringify(parsed, null, 2);
  } catch { /* Plain text. */ }

  tools.append(button(json ? "Format JSON" : "Format code", () => {
    const formatted = formatCodeText(container.textContent || text);
    if (formatted) {
      container.textContent = formatted;
      container.classList.add("code-view");
      monoBtn.setAttribute("aria-pressed", "true");
      if (labelEl) labelEl.textContent = "Code";
      if (toast) toast("Code formatted.", "success");
    }
  }));

  tools.append(button("Download text", () => saveBlob(new Blob([container.textContent || text], { type: json ? "application/json" : "text/plain" }), json ? "drop.json" : "drop.txt")));
  const toolbarSlot = document.getElementById("modal-text-tools-slot");
  if (toolbarSlot) toolbarSlot.replaceChildren(tools);
  else container.before(tools);
}
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = node("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function addFileTools(container, files, group, toast) {
  document.getElementById("file-batch-tools")?.remove();
  const tools = node("div", null, "smart-tools file-batch-toolbar");
  tools.id = "file-batch-tools";
  if (group.burnAfterRead) tools.append(node("p", group.isOwner ? "Owner downloads do not consume attachments." : "Each attachment can be downloaded once. A cancelled download still counts.", "feature-hint"));
  if (files.length > 1) tools.append(button(`Download all (${files.length})`, async (event) => {
    const target = event.currentTarget; target.disabled = true;
    try {
      const archive = Object.create(null); let total = 0;
      for (let i = 0; i < files.length; i++) {
        target.textContent = `Downloading ${i + 1}/${files.length}…`;
        const response = await fetch(files[i].downloadUrl, { credentials: "same-origin" });
        if (!response.ok) throw new Error("A download expired or was already consumed. Reopen the drop.");
        const bytes = new Uint8Array(await response.arrayBuffer()); total += bytes.length;
        if (total > 32 * 1024 * 1024) throw new Error("Download these files individually.");
        const name = files[i].filename.replace(/[\\/\x00-\x1f]/g, "_").replace(/^\.+/, "_");
        archive[`${i + 1}-${name}`] = bytes;
      }
      saveBlob(new Blob([zipSync(archive, { level: 0 })], { type: "application/zip" }), "airtext-files.zip");
      target.textContent = "Downloaded";
    } catch (error) { toast(error.message, "error"); target.disabled = false; target.textContent = `Download all (${files.length})`; }
  }, "primary-action"));
  if (tools.childNodes.length) container.before(tools);
  // Previews are opt-in, and never consume an Open once recipient's download.
  if (group.burnAfterRead && !group.isOwner) return;
  for (let i = 0; i < files.length; i++) {
    const file = files[i]; const row = container.children[i];
    if (!row || file.sizeBytes > 5 * 1024 * 1024 || !file.downloadUrl) continue;
    const safeImage = /^image\/(png|jpeg|webp|gif)$/.test(file.mime);
    const safeMedia = /^(audio\/(mpeg|ogg|wav|webm)|video\/(mp4|webm))$/.test(file.mime);
    const safeText = /^(text\/(plain|csv)|application\/json)$/.test(file.mime);
    if (!safeImage && !safeMedia && !safeText) continue;
    const details = node("details", null, "file-preview"); details.append(node("summary", "Preview")); row.append(details);
    details.addEventListener("toggle", async () => {
      if (!details.open || details.dataset.loaded) return;
      details.dataset.loaded = "1";
      if (safeText) {
        try { const r = await fetch(file.downloadUrl); if (!r.ok) throw Error("Preview expired."); details.append(node("pre", (await r.text()).slice(0, 100_000))); } catch (error) { details.append(node("p", error.message)); }
      } else {
        const media = node(safeImage ? "img" : file.mime.startsWith("audio/") ? "audio" : "video");
        media.src = file.downloadUrl;
        if (safeImage) { media.alt = file.filename; media.loading = "lazy"; } else { media.controls = true; media.preload = "metadata"; }
        details.append(media);
      }
    });
  }
}

export function uploadRequest(url, options) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open(options.method || "POST", url); xhr.withCredentials = true;
    for (const [key, value] of new Headers(options.headers || {})) xhr.setRequestHeader(key, value);
    const target = document.getElementById("upload-progress");
    if (target) { target.hidden = false; target.textContent = "Uploading…"; }
    xhr.upload.onprogress = (event) => { if (target && event.lengthComputable) target.textContent = `Uploading… ${Math.round(event.loaded / event.total * 100)}%`; };
    xhr.onerror = () => { if (target) target.textContent = "Upload interrupted."; reject(new Error("Network error. Try uploading again.")); };
    xhr.onload = () => {
      let data; try { data = JSON.parse(xhr.responseText); } catch { reject(new Error("Invalid upload response.")); return; }
      if (target) target.textContent = xhr.status < 400 ? "Upload complete." : "Upload failed.";
      if (xhr.status >= 400 || data.ok === false) { const error = new Error(data.error || "Upload failed."); error.code = data.code; reject(error); } else resolve(data);
    };
    xhr.send(options.body);
  });
}
