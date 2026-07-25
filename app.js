// ---------- 工具函数 ----------
function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function base64ToUtf8(str) {
  return decodeURIComponent(escape(atob(str)));
}
function getSettings() {
  try {
    return JSON.parse(localStorage.getItem('journalSettings') || '{}');
  } catch {
    return {};
  }
}
function saveSettingsToStorage(s) {
  localStorage.setItem('journalSettings', JSON.stringify(s));
}
function ghHeaders(token) {
  return {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github+json'
  };
}
function apiBase(owner, repo) {
  return `https://api.github.com/repos/${owner}/${repo}/contents`;
}

// ---------- GitHub 读写封装 ----------
async function fetchEntriesFile(settings) {
  const { owner, repo, branch, token } = settings;
  const url = `${apiBase(owner, repo)}/entries.json?ref=${branch}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (res.status === 404) {
    return { entries: [], sha: null };
  }
  if (!res.ok) throw new Error(`读取 entries.json 失败 (${res.status})`);
  const data = await res.json();
  const content = base64ToUtf8(data.content.replace(/\n/g, ''));
  return { entries: JSON.parse(content || '[]'), sha: data.sha };
}

async function putEntriesFile(settings, entries, sha) {
  const { owner, repo, branch, token } = settings;
  const url = `${apiBase(owner, repo)}/entries.json`;
  const body = {
    message: `update entries.json (${entries.length} 条)`,
    content: utf8ToBase64(JSON.stringify(entries, null, 2)),
    branch
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`保存 entries.json 失败: ${err.message || res.status}`);
  }
  return res.json();
}

async function putImageFile(settings, filename, base64Data) {
  const { owner, repo, branch, token } = settings;
  const url = `${apiBase(owner, repo)}/images/${filename}`;
  const body = {
    message: `add image ${filename}`,
    content: base64Data,
    branch
  };
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`上传图片失败: ${err.message || res.status}`);
  }
  return res.json();
}

async function deleteImageFile(settings, filename, sha) {
  const { owner, repo, branch, token } = settings;
  const url = `${apiBase(owner, repo)}/images/${filename}`;
  await fetch(url, {
    method: 'DELETE',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `remove image ${filename}`, sha, branch })
  });
}

async function getImageSha(settings, filename) {
  const { owner, repo, branch, token } = settings;
  const url = `${apiBase(owner, repo)}/images/${filename}?ref=${branch}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) return null;
  const data = await res.json();
  return data.sha;
}

function rawImageUrl(settings, filename) {
  const { owner, repo, branch } = settings;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/images/${filename}`;
}

// private 仓库下，raw.githubusercontent.com 裸链接没有 token 会 404，
// 必须走 Contents API 带 token 认证获取，再转成本地 blob URL 给 <img> 用。
const imageBlobCache = new Map();
async function loadImageBlobUrl(settings, filename) {
  if (imageBlobCache.has(filename)) return imageBlobCache.get(filename);
  const { owner, repo, branch, token } = settings;
  const url = `${apiBase(owner, repo)}/images/${filename}?ref=${branch}`;
  const res = await fetch(url, {
    headers: { ...ghHeaders(token), Accept: 'application/vnd.github.raw+json' }
  });
  if (!res.ok) throw new Error(`图片加载失败 (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  imageBlobCache.set(filename, objectUrl);
  return objectUrl;
}

// ---------- UI 状态 ----------
let selectedFile = null;

const els = {
  settingsBtn: document.getElementById('settingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  ownerInput: document.getElementById('ownerInput'),
  repoInput: document.getElementById('repoInput'),
  branchInput: document.getElementById('branchInput'),
  tokenInput: document.getElementById('tokenInput'),
  saveSettings: document.getElementById('saveSettings'),
  cancelSettings: document.getElementById('cancelSettings'),
  uploadZone: document.getElementById('uploadZone'),
  imageInput: document.getElementById('imageInput'),
  uploadPlaceholder: document.getElementById('uploadPlaceholder'),
  imagePreview: document.getElementById('imagePreview'),
  captionInput: document.getElementById('captionInput'),
  charCount: document.getElementById('charCount'),
  entryForm: document.getElementById('entryForm'),
  saveBtn: document.getElementById('saveBtn'),
  statusMsg: document.getElementById('statusMsg'),
  galleryGrid: document.getElementById('galleryGrid'),
  galleryStatus: document.getElement yId('galleryStatus'),
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabPanels: document.querySelectorAll('.tab-panel')
};