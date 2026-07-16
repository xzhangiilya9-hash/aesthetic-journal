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
  galleryStatus: document.getElementById('galleryStatus'),
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabPanels: document.querySelectorAll('.tab-panel')
};

// ---------- 标签切换 ----------
els.tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    els.tabBtns.forEach(b => b.classList.remove('active'));
    els.tabPanels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'gallery') loadGallery();
  });
});

// ---------- 设置弹层 ----------
function openSettings() {
  const s = getSettings();
  els.ownerInput.value = s.owner || '';
  els.repoInput.value = s.repo || '';
  els.branchInput.value = s.branch || 'main';
  els.tokenInput.value = s.token || '';
  els.settingsModal.hidden = false;
}
els.settingsBtn.addEventListener('click', openSettings);
els.cancelSettings.addEventListener('click', () => els.settingsModal.hidden = true);
els.saveSettings.addEventListener('click', () => {
  const s = {
    owner: els.ownerInput.value.trim(),
    repo: els.repoInput.value.trim(),
    branch: els.branchInput.value.trim() || 'main',
    token: els.tokenInput.value.trim()
  };
  if (!s.owner || !s.repo || !s.token) {
    alert('用户名、仓库名、Token 都要填哦');
    return;
  }
  saveSettingsToStorage(s);
  els.settingsModal.hidden = true;
});

function ensureSettings() {
  const s = getSettings();
  if (!s.owner || !s.repo || !s.token) {
    openSettings();
    return null;
  }
  return s;
}

// ---------- 上传预览 ----------
els.uploadZone.addEventListener('click', () => els.imageInput.click());
els.imageInput.addEventListener('change', () => {
  const file = els.imageInput.files[0];
  if (!file) return;
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    els.imagePreview.src = e.target.result;
    els.imagePreview.hidden = false;
    els.uploadPlaceholder.hidden = true;
  };
  reader.readAsDataURL(file);
});

els.captionInput.addEventListener('input', () => {
  els.charCount.textContent = els.captionInput.value.length;
});

// ---------- 保存一条 ----------
els.entryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const settings = ensureSettings();
  if (!settings) return;

  const caption = els.captionInput.value.trim();
  if (!selectedFile) {
    els.statusMsg.textContent = '先选一张图片吧';
    return;
  }
  if (!caption) {
    els.statusMsg.textContent = '写一句话再存下来';
    return;
  }

  els.saveBtn.disabled = true;
  els.statusMsg.textContent = '正在存进你的仓库……';

  try {
    const ext = (selectedFile.name.split('.').pop() || 'jpg').toLowerCase();
    const id = Date.now();
    const filename = `${id}.${ext}`;

    // 读文件为纯 base64（去掉 data:xxx;base64, 前缀）
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(selectedFile);
    });

    await putImageFile(settings, filename, base64);

    const { entries, sha } = await fetchEntriesFile(settings);
    entries.unshift({
      id,
      date: new Date().toISOString().slice(0, 10),
      image: filename,
      caption
    });
    await putEntriesFile(settings, entries, sha);

    els.statusMsg.textContent = '存好啦 ✓';
    els.entryForm.reset();
    selectedFile = null;
    els.imagePreview.hidden = true;
    els.uploadPlaceholder.hidden = false;
    els.charCount.textContent = '0';
  } catch (err) {
    console.error(err);
    els.statusMsg.textContent = err.message || '出错了，再试一次';
  } finally {
    els.saveBtn.disabled = false;
  }
});

// ---------- 画廊 ----------
async function loadGallery() {
  const settings = ensureSettings();
  if (!settings) return;

  els.galleryStatus.textContent = '加载中……';
  els.galleryGrid.innerHTML = '';

  try {
    const { entries } = await fetchEntriesFile(settings);
    if (entries.length === 0) {
      els.galleryStatus.textContent = '还没有内容，去写第一条吧';
      return;
    }
    els.galleryStatus.textContent = '';
    entries.forEach((entry, i) => {
      const card = document.createElement('div');
      card.className = 'gallery-card';
      card.style.setProperty('--rot', `${(i % 2 === 0 ? -1 : 1) * (0.6 + (i % 3) * 0.4)}deg`);

      const img = document.createElement('img');
      img.src = rawImageUrl(settings, entry.image);
      img.loading = 'lazy';
      img.alt = entry.caption;

      const caption = document.createElement('p');
      caption.className = 'gallery-caption';
      caption.textContent = entry.caption;

      const date = document.createElement('p');
      date.className = 'gallery-date';
      date.textContent = entry.date;

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.textContent = '×';
      delBtn.title = '删除这一条';
      delBtn.addEventListener('click', () => deleteEntry(entry, settings));

      card.append(delBtn, img, caption, date);
      els.galleryGrid.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    els.galleryStatus.textContent = err.message || '加载失败，检查一下设置里的仓库信息';
  }
}

async function deleteEntry(entry, settings) {
  if (!confirm('确定删掉这一条吗？')) return;
  try {
    const { entries, sha } = await fetchEntriesFile(settings);
    const remaining = entries.filter(e => e.id !== entry.id);
    await putEntriesFile(settings, remaining, sha);
    const imgSha = await getImageSha(settings, entry.image);
    if (imgSha) await deleteImageFile(settings, entry.image, imgSha);
    loadGallery();
  } catch (err) {
    alert(err.message || '删除失败');
  }
}

// ---------- 初始化 ----------
if (!getSettings().token) {
  // 首次使用自动弹出设置
  setTimeout(openSettings, 300);
}
