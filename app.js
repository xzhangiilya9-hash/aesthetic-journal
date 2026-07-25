/* ═══════════════════════════════════════════
   拾光集 — 内容存进你自己的 GitHub 仓库
   ═══════════════════════════════════════════ */

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
function hasSettings(s) {
  return !!(s && s.owner && s.repo && s.branch && s.token);
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
function cnDate(iso) {
  const d = new Date(iso);
  const cn = '〇一二三四五六七八九';
  const num = n => n <= 10 ? (n === 10 ? '十' : cn[n])
    : n < 20 ? '十' + cn[n - 10]
    : cn[Math.floor(n / 10)] + '十' + (n % 10 ? cn[n % 10] : '');
  return `${num(d.getMonth() + 1)}月${num(d.getDate())}日`;
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

async function getImageSha(settings, filename) {
  const { owner, repo, branch, token } = settings;
  const url = `${apiBase(owner, repo)}/images/${filename}?ref=${branch}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) return null;
  const data = await res.json();
  return data.sha;
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

// private 仓库下 raw.githubusercontent.com 裸链没有 token 会 404，
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

// 上传前压缩：长边 1600px，JPEG 0.85 —— 避免仓库被原图撑爆
function compressImage(file, maxEdge = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片解析失败'));
      img.onload = () => {
        let { width: w, height: h } = img;
        if (Math.max(w, h) > maxEdge) {
          const k = maxEdge / Math.max(w, h);
          w = Math.round(w * k);
          h = Math.round(h * k);
        }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = cv.toDataURL('image/jpeg', quality);
        resolve({ base64: dataUrl.split(',')[1], dataUrl });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- 状态 ----------
let entries = [];      // 最新的在前
let entriesSha = null;
let cursor = 0;        // 已翻过的张数
let selectedImage = null;
let busy = false;

// 手工微差：真实的一摞纸不会是等差数列
const OFFSET = [
  { y: 0,  x: 0,   r: -1.2, s: 1     },
  { y: 7,  x: 9,   r: 3.4,  s: 0.985 },
  { y: 14, x: -11, r: -4.1, s: 0.972 },
  { y: 20, x: 6,   r: 2.2,  s: 0.960 },
  { y: 26, x: -4,  r: -2.8, s: 0.949 }
];
const VISIBLE = OFFSET.length;

const els = {
  settingsBtn:     document.getElementById('settingsBtn'),
  settingsModal:   document.getElementById('settingsModal'),
  settingsForm:    document.getElementById('settingsForm'),
  settingsMsg:     document.getElementById('settingsMsg'),
  cancelSettings:  document.getElementById('cancelSettings'),
  ownerInput:      document.getElementById('ownerInput'),
  repoInput:       document.getElementById('repoInput'),
  branchInput:     document.getElementById('branchInput'),
  tokenInput:      document.getElementById('tokenInput'),

  composeBtn:      document.getElementById('composeBtn'),
  composeSheet:    document.getElementById('composeSheet'),
  closeCompose:    document.getElementById('closeCompose'),
  entryForm:       document.getElementById('entryForm'),
  dropZone:        document.getElementById('dropZone'),
  imageInput:      document.getElementById('imageInput'),
  dropEmpty:       document.getElementById('dropEmpty'),
  imagePreview:    document.getElementById('imagePreview'),
  captionInput:    document.getElementById('captionInput'),
  charCount:       document.getElementById('charCount'),
  saveBtn:         document.getElementById('saveBtn'),
  statusMsg:       document.getElementById('statusMsg'),

  stack:           document.getElementById('stack'),
  stageNote:       document.getElementById('stageNote'),
  counter:         document.getElementById('counter'),
  resetBtn:        document.getElementById('resetBtn')
};

// ---------- 提示 ----------
function note(html) {
  els.stageNote.innerHTML = html;
  els.stageNote.hidden = false;
}
function clearNote() {
  els.stageNote.hidden = true;
}
function say(el, text, isErr = false) {
  el.textContent = text;
  el.classList.toggle('err', isErr);
}

// ---------- 渲染信堆 ----------
function renderStack() {
  els.stack.innerHTML = '';

  if (!entries.length) {
    els.counter.textContent = '';
    els.resetBtn.hidden = true;
    note('<p>还没有第一条</p><small>写一条吧</small>');
    return;
  }
  clearNote();

  const rest = entries.slice(cursor);
  if (!rest.length) {
    els.counter.textContent = '';
    els.resetBtn.hidden = false;
    note('<p>都看完了</p>');
    return;
  }

  rest.slice(0, VISIBLE).forEach((entry, i) => {
    const o = OFFSET[i];
    const el = document.createElement('article');
    el.className = 'letter';
    el.dataset.i = i;
    el.style.setProperty('--r', o.r + 'deg');
    el.style.transform = `translate(${o.x}px,${o.y}px) rotate(${o.r}deg) scale(${o.s})`;
    el.style.zIndex = 100 - i;
    el.style.pointerEvents = i === 0 ? 'auto' : 'none';

    el.innerHTML =
      '<img class="photo" alt="">' +
      `<p class="cap">${escapeHtml(entry.caption || '')}</p>` +
      `<p class="date">${escapeHtml(entry.date || '')}</p>` +
      (i === 0 ? '<button class="del" title="删除" aria-label="删除">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M18 6 6 18M6 6l12 12"/></svg></button>' : '');

    // 图片按需加载（private 仓库需带 token）
    const img = el.querySelector('.photo');
    const settings = getSettings();
    if (entry.file) {
      loadImageBlobUrl(settings, entry.file)
        .then(u => { img.src = u; })
        .catch(() => { img.removeAttribute('src'); });
    }

    if (i === 0) {
      el.addEventListener('click', ev => {
        if (ev.target.closest('.del')) {
          ev.stopPropagation();
          removeEntry(entries[cursor]);
          return;
        }
        flip();
      });
    }
    els.stack.appendChild(el);
  });

  els.counter.textContent = `${cursor + 1} / ${entries.length}`;
  els.resetBtn.hidden = cursor === 0;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function flip() {
  const top = els.stack.querySelector('.letter[data-i="0"]');
  if (!top) return;
  top.classList.add('gone');
  cursor++;
  setTimeout(renderStack, 260);
}

// ---------- 载入 ----------
async function loadEntries() {
  const settings = getSettings();
  if (!hasSettings(settings)) {
    note('<p>先连上你的仓库</p><small>点右上角设置</small>');
    els.counter.textContent = '';
    return;
  }
  note('<p>正在取回……</p>');
  try {
    const r = await fetchEntriesFile(settings);
    entries = (r.entries || []).slice().reverse();   // 最新的在最上面
    entriesSha = r.sha;
    cursor = 0;
    renderStack();
  } catch (e) {
    note(`<p>没能取回</p><small>${escapeHtml(e.message)}</small>`);
  }
}

// ---------- 新增 ----------
async function addEntry(ev) {
  ev.preventDefault();
  if (busy) return;

  const settings = getSettings();
  if (!hasSettings(settings)) {
    say(els.statusMsg, '还没连上仓库，先去设置', true);
    return;
  }
  if (!selectedImage) {
    say(els.statusMsg, '还没选图', true);
    return;
  }
  const caption = els.captionInput.value.trim();

  busy = true;
  els.saveBtn.disabled = true;
  say(els.statusMsg, '正在存……');

  try {
    const now = new Date();
    const filename = `${now.getTime()}.jpg`;

    await putImageFile(settings, filename, selectedImage.base64);

    // 重新取一次，避免与其他设备的改动撞车
    const fresh = await fetchEntriesFile(settings);
    const list = fresh.entries || [];
    list.push({
      id: String(now.getTime()),
      file: filename,
      caption,
      date: cnDate(now.toISOString()),
      createdAt: now.toISOString()
    });
    await putEntriesFile(settings, list, fresh.sha);

    say(els.statusMsg, '存好了');
    resetCompose();
    setTimeout(() => {
      els.composeSheet.hidden = true;
      say(els.statusMsg, '');
      loadEntries();
    }, 700);
  } catch (e) {
    say(els.statusMsg, e.message, true);
  } finally {
    busy = false;
    els.saveBtn.disabled = false;
  }
}

// ---------- 删除 ----------
async function removeEntry(entry) {
  if (busy || !entry) return;
  if (!confirm('删掉这一条？')) return;

  const settings = getSettings();
  busy = true;
  try {
    const fresh = await fetchEntriesFile(settings);
    const list = (fresh.entries || []).filter(e => e.id !== entry.id);
    await putEntriesFile(settings, list, fresh.sha);

    if (entry.file) {
      const sha = await getImageSha(settings, entry.file);
      if (sha) await deleteImageFile(settings, entry.file, sha);
      imageBlobCache.delete(entry.file);
    }
    await loadEntries();
  } catch (e) {
    note(`<p>删除失败</p><small>${escapeHtml(e.message)}</small>`);
  } finally {
    busy = false;
  }
}

// ---------- 写一条：表单 ----------
function resetCompose() {
  selectedImage = null;
  els.imageInput.value = '';
  els.imagePreview.hidden = true;
  els.imagePreview.removeAttribute('src');
  els.dropEmpty.hidden = false;
  els.captionInput.value = '';
  els.charCount.textContent = '0';
}

async function onPickImage() {
  const file = els.imageInput.files && els.imageInput.files[0];
  if (!file) return;
  say(els.statusMsg, '处理中……');
  try {
    selectedImage = await compressImage(file);
    els.imagePreview.src = selectedImage.dataUrl;
    els.imagePreview.hidden = false;
    els.dropEmpty.hidden = true;
    say(els.statusMsg, '');
  } catch (e) {
    say(els.statusMsg, e.message, true);
  }
}

// ---------- 设置 ----------
function openSettings() {
  const s = getSettings();
  els.ownerInput.value  = s.owner  || '';
  els.repoInput.value   = s.repo   || '';
  els.branchInput.value = s.branch || 'main';
  els.tokenInput.value  = s.token  || '';
  say(els.settingsMsg, '');
  els.settingsModal.hidden = false;
}

function onSaveSettings(ev) {
  ev.preventDefault();
  const s = {
    owner:  els.ownerInput.value.trim(),
    repo:   els.repoInput.value.trim(),
    branch: els.branchInput.value.trim() || 'main',
    token:  els.tokenInput.value.trim()
  };
  if (!hasSettings(s)) {
    say(els.settingsMsg, '四项都要填', true);
    return;
  }
  saveSettingsToStorage(s);
  imageBlobCache.clear();
  say(els.settingsMsg, '好了');
  setTimeout(() => {
    els.settingsModal.hidden = true;
    loadEntries();
  }, 500);
}

// ---------- 绑定 ----------
els.settingsBtn.addEventListener('click', openSettings);
els.cancelSettings.addEventListener('click', () => { els.settingsModal.hidden = true; });
els.settingsForm.addEventListener('submit', onSaveSettings);

els.composeBtn.addEventListener('click', () => {
  resetCompose();
  say(els.statusMsg, '');
  els.composeSheet.hidden = false;
});
els.closeCompose.addEventListener('click', () => { els.composeSheet.hidden = true; });
els.entryForm.addEventListener('submit', addEntry);
els.imageInput.addEventListener('change', onPickImage);

els.captionInput.addEventListener('input', () => {
  els.charCount.textContent = els.captionInput.value.length;
});

els.resetBtn.addEventListener('click', () => { cursor = 0; renderStack(); });

// 点遮罩空白处关闭
[els.composeSheet, els.settingsModal].forEach(mask => {
  mask.addEventListener('click', ev => {
    if (ev.target === mask) mask.hidden = true;
  });
});

// 键盘：Esc 关浮层，空格/方向键翻信
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') {
    els.composeSheet.hidden = true;
    els.settingsModal.hidden = true;
    return;
  }
  const overlayOpen = !els.composeSheet.hidden || !els.settingsModal.hidden;
  if (overlayOpen) return;
  if (ev.key === ' ' || ev.key === 'ArrowDown' || ev.key === 'ArrowRight') {
    ev.preventDefault();
    flip();
  }
});

// ---------- 启动 ----------
loadEntries();
