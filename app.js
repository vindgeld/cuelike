// cuelike timeline - app.js
(() => {
  const STORAGE_KEY = 'cuelike.projects.v1';
  const TEMPLATES_KEY = 'cuelike.templates.v1';
  let projects = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  let templates = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]');
  let currentProjectId = projects.length ? projects[0].id : null;
  let editingIndex = null; // index of segment being edited
  let editingTemplateIndex = null; // index of template being edited
  let pxPerSec = Number(localStorage.getItem('cuelike.scale') || 60); // pixels per second

  // Unified player state
  let isYouTube = false;
  let ytPlayer = null;
  let ytPollId = null;

  // Segment playback state
  let playingSegmentIndex = null;
  let segmentLooping = {}; // map index->bool
  let segmentPlayWatcher = null;

  // DOM
  const projectSelect = document.getElementById('projectSelect');
  const createProjectBtn = document.getElementById('createProjectBtn');
  const addSegmentBtn = document.getElementById('addSegmentBtn');
  const segmentList = document.getElementById('segmentList');
  const projectTitle = document.getElementById('projectTitle');
  const segmentsSummary = document.getElementById('segmentsSummary');

  const timeline = document.getElementById('timeline');
  const ruler = document.getElementById('ruler');
  const playhead = document.getElementById('playhead');
  const video = document.getElementById('video');
  const videoInput = document.getElementById('videoInput');
  const youtubePlayerDiv = document.getElementById('youtubePlayer');
  const youtubeURL = document.getElementById('youtubeURL');
  const loadYoutubeBtn = document.getElementById('loadYoutubeBtn');

  // Templates UI
  const addTemplateBtn = document.getElementById('addTemplateBtn');
  const templateButtons = document.getElementById('templateButtons');
  const importTemplatesBtn = document.getElementById('importTemplatesBtn');
  const exportTemplatesBtn = document.getElementById('exportTemplatesBtn');

  const segmentModal = document.getElementById('segmentModal');
  const segStart = document.getElementById('segStart');
  const segDuration = document.getElementById('segDuration');
  const segTitle = document.getElementById('segTitle');
  const segRemarks = document.getElementById('segRemarks');
  const segColor = document.getElementById('segColor');
  const saveSegBtn = document.getElementById('saveSegBtn');
  const cancelSegBtn = document.getElementById('cancelSegBtn');
  const modalTitle = document.getElementById('modalTitle');

  // Template modal
  const templateModal = document.getElementById('templateModal');
  const templateModalTitle = document.getElementById('templateModalTitle');
  const tplTitle = document.getElementById('tplTitle');
  const tplDuration = document.getElementById('tplDuration');
  const tplColor = document.getElementById('tplColor');
  const saveTplBtn = document.getElementById('saveTplBtn');
  const cancelTplBtn = document.getElementById('cancelTplBtn');
  const tplError = document.getElementById('tplError');
  const templatePreview = document.getElementById('templatePreview');

  const scaleRange = document.getElementById('scaleRange');
  const scaleValue = document.getElementById('scaleValue');

  // XLSX controls
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const fileInput = document.getElementById('file-input');

  // helpers for YouTube id
  function extractVideoId(url) {
    if (!url) return null;
    const m = url.match(/(?:v=|\/embed\/|youtu\.be\/|\/v\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  // init
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }
  function saveTemplates() {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  }
  function setCurrentProject(id) {
    currentProjectId = id;
    renderUI();
  }

  // Template helpers
  function renderTemplates() {
    templateButtons.innerHTML = '';
    templates.forEach((t, idx) => {
      const btn = document.createElement('div');
      btn.className = 'template-button';
      btn.style.background = t.color || 'rgba(255,255,255,0.02)';
      btn.draggable = true;
      btn.dataset.index = idx;
      btn.innerHTML = `<span class="label">${t.title}</span>`;
      const actions = document.createElement('div');
      actions.className = 'actions';
      const editBtn = document.createElement('button'); editBtn.textContent = '✎'; editBtn.title = 'Edit template';
      const del = document.createElement('button'); del.textContent = '×'; del.title = 'Delete template';
      editBtn.onclick = (ev) => { ev.stopPropagation(); openTemplateModal(idx); };
      del.onclick = (ev) => { ev.stopPropagation(); if (confirm(`Delete template "${t.title}"?`)) { templates.splice(idx,1); saveTemplates(); renderTemplates(); } };
      actions.appendChild(editBtn);
      actions.appendChild(del);
      btn.appendChild(actions);
      btn.addEventListener('click', (ev) => { ev.stopPropagation(); addSegmentFromTemplate(t); });

      // drag handlers
      btn.addEventListener('dragstart', onTemplateDragStart);
      btn.addEventListener('dragover', onTemplateDragOver);
      btn.addEventListener('drop', onTemplateDrop);
      btn.addEventListener('dragend', onTemplateDragEnd);

      templateButtons.appendChild(btn);
    });
  }

  let draggedTemplateIndex = null;
  function onTemplateDragStart(e) {
    const idx = Number(this.dataset.index);
    draggedTemplateIndex = idx;
    this.classList.add('dragging');
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch(_) {}
  }
  function onTemplateDragOver(e) {
    e.preventDefault();
    // visual feedback: highlight target
    this.classList.add('drag-over');
  }
  function onTemplateDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    const targetIdx = Number(this.dataset.index);
    if (draggedTemplateIndex === null || draggedTemplateIndex === targetIdx) return;
    // reorder templates array
    const [item] = templates.splice(draggedTemplateIndex, 1);
    templates.splice(targetIdx, 0, item);
    saveTemplates();
    draggedTemplateIndex = null;
    renderTemplates();
  }
  function onTemplateDragEnd(e) {
    draggedTemplateIndex = null;
    const elems = templateButtons.querySelectorAll('.template-button');
    elems.forEach(el => el.classList.remove('dragging', 'drag-over'));
  }

  function openTemplateModal(index = null) {
    editingTemplateIndex = index;
    tplError.textContent = '';
    if (index === null) {
      templateModalTitle.textContent = 'New Template';
      tplTitle.value = '';
      tplDuration.value = 3;
      tplColor.value = '#00cc88';
    } else {
      templateModalTitle.textContent = 'Edit Template';
      const t = templates[index];
      tplTitle.value = t.title || '';
      tplDuration.value = t.duration || 3;
      tplColor.value = t.color || '#00cc88';
    }
    updateTemplatePreview();
    templateModal.classList.remove('hidden');
    tplTitle.focus();
  }

  function closeTemplateModal() {
    templateModal.classList.add('hidden');
    editingTemplateIndex = null;
    tplError.textContent = '';
  }

  function validateTemplateForm() {
    const title = (tplTitle.value || '').trim();
    const duration = Number(tplDuration.value);
    if (!title) return 'Title is required';
    if (!isFinite(duration) || duration <= 0) return 'Duration must be > 0';
    return null;
  }

  function saveTemplateFromModal() {
    const err = validateTemplateForm();
    if (err) { tplError.textContent = err; return; }
    const title = tplTitle.value.trim();
    const duration = Math.max(0.1, Number(tplDuration.value) || 3);
    const color = tplColor.value || '#00cc88';
    if (editingTemplateIndex === null) {
      templates.push({ id: Date.now().toString(36), title, duration, color });
    } else {
      templates[editingTemplateIndex].title = title;
      templates[editingTemplateIndex].duration = duration;
      templates[editingTemplateIndex].color = color;
    }
    saveTemplates();
    renderTemplates();
    closeTemplateModal();
  }

  function updateTemplatePreview() {
    const title = (tplTitle.value || '').trim() || 'Preview';
    const color = tplColor.value || '#00cc88';
    templatePreview.textContent = title;
    templatePreview.style.background = color;
    templatePreview.style.color = '#001';
  }

  function addTemplate() { openTemplateModal(null); }

  function addSegmentFromTemplate(template) {
    const proj = getCurrentProject();
    if (!proj) {
      if (!confirm('No project selected. Create a new project now?')) return;
      const name = prompt('Project name') || `Project ${Date.now()}`;
      const p = { id: Date.now().toString(36), name, segments: [] };
      projects.push(p);
      save();
      setCurrentProject(p.id);
    }
    const curProj = getCurrentProject();
    const start = Math.round(getCurrentTime() * 10) / 10;
    const seg = {
      start,
      duration: template.duration || 5,
      title: template.title || '(untitled)',
      remarks: '',
      color: template.color || '#00cc88'
    };
    curProj.segments.push(seg);
    curProj.segments.sort((a,b)=>a.start - b.start);
    save();
    renderUI();
    seekTo(seg.start);
    updatePlayhead();
  }

  function importTemplates(json) {
    try {
      const arr = JSON.parse(json);
      if (!Array.isArray(arr)) throw new Error('Not an array');
      for (const t of arr) {
        if (!t.title) continue;
        templates.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2,5), title: t.title, duration: Number(t.duration) || 5, color: t.color || '#00cc88' });
      }
      saveTemplates();
      renderTemplates();
      alert('Templates imported');
    } catch (e) {
      alert('Invalid templates JSON');
    }
  }

  function exportTemplates() {
    const data = JSON.stringify(templates, null, 2);
    const blob = new Blob([data], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'cuelike-templates.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // project & segment logic
  function createProject() {
    const name = prompt('Enter project name');
    if (!name) return;
    const project = { id: Date.now().toString(36), name, segments: [] };
    projects.push(project);
    save();
    setCurrentProject(project.id);
    renderProjectSelect();
  }

  function renderProjectSelect() {
    projectSelect.innerHTML = '';
    projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      if (p.id === currentProjectId) opt.selected = true;
      projectSelect.appendChild(opt);
    });
    if (!projects.length) {
      const opt = document.createElement('option'); opt.textContent = '(no project)'; opt.disabled = true;
      projectSelect.appendChild(opt);
      currentProjectId = null;
    }
  }

  function getCurrentProject() {
    return projects.find(p => p.id === currentProjectId);
  }

  function renderUI() {
    renderProjectSelect();
    renderTemplates();
    const proj = getCurrentProject();
    projectTitle.textContent = proj ? proj.name : '(no project)';
    if (!proj) {
      segmentList.innerHTML = ''; timeline.innerHTML = ''; ruler.innerHTML = ''; segmentsSummary.textContent = '';
      return;
    }

    segmentsSummary.textContent = `${proj.segments.length} segments`;
    renderSegmentList();
    renderRuler();
    renderTimeline();
  }

  function renderSegmentList() {
    const proj = getCurrentProject();
    segmentList.innerHTML = '';
    proj.segments.forEach((s, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<div>
        <strong>${i+1}. ${s.title || '(untitled)'}</strong><div style="font-size:0.8rem;color:var(--muted)">${s.start}s • ${s.duration}s</div>
      </div>`;
      const controls = document.createElement('div');
      controls.style.display = 'flex';
      controls.style.gap = '8px';

      const playBtn = document.createElement('button');
      playBtn.textContent = 'Play';
      playBtn.title = 'Play segment';
      playBtn.onclick = (ev) => { ev.stopPropagation(); togglePlaySegment(i, playBtn); };

      const loopBtn = document.createElement('button');
      loopBtn.textContent = segmentLooping[i] ? 'Loop ✓' : 'Loop';
      loopBtn.title = 'Toggle loop';
      loopBtn.onclick = (ev) => { ev.stopPropagation(); segmentLooping[i] = !segmentLooping[i]; loopBtn.textContent = segmentLooping[i] ? 'Loop ✓' : 'Loop'; };

      const gotoBtn = document.createElement('button'); gotoBtn.textContent = 'Go';
      const editBtn = document.createElement('button'); editBtn.textContent = 'Edit';
      const delBtn = document.createElement('button'); delBtn.textContent = 'Delete';

      editBtn.onclick = (ev) => { ev.stopPropagation(); openEditModal(i); };
      delBtn.onclick = (ev) => { ev.stopPropagation(); if(confirm('Delete segment?')) { proj.segments.splice(i,1); save(); renderUI(); } };
      gotoBtn.onclick = (ev) => { ev.stopPropagation(); seekTo(s.start); updatePlayhead(); };

      controls.appendChild(playBtn);
      controls.appendChild(loopBtn);
      controls.appendChild(gotoBtn);
      controls.appendChild(editBtn);
      controls.appendChild(delBtn);

      li.appendChild(controls);
      segmentList.appendChild(li);
    });
  }

  function togglePlaySegment(index, playBtnEl) {
    if (playingSegmentIndex === index) {
      stopSegmentPlayback();
      if (playBtnEl) playBtnEl.textContent = 'Play';
    } else {
      startSegmentPlayback(index);
      Array.from(segmentList.querySelectorAll('li')).forEach((li, idx) => {
        const btn = li.querySelector('button');
        if (!btn) return;
        if (idx === index) btn.textContent = 'Stop';
        else btn.textContent = 'Play';
      });
    }
  }

  function openAddModal(defaultStart = 0) {
    editingIndex = null;
    modalTitle.textContent = 'Add Segment';
    segStart.value = defaultStart;
    segDuration.value = 5;
    segTitle.value = '';
    segRemarks.value = '';
    segColor.value = '#00cc88';
    segmentModal.classList.remove('hidden');
    segTitle.focus();
  }
  function openEditModal(index) {
    const proj = getCurrentProject();
    const s = proj.segments[index];
    editingIndex = index;
    modalTitle.textContent = 'Edit Segment';
    segStart.value = s.start;
    segDuration.value = s.duration;
    segTitle.value = s.title;
    segRemarks.value = s.remarks || '';
    segColor.value = s.color || '#00cc88';
    segmentModal.classList.remove('hidden');
    segTitle.focus();
  }
  function closeModal() { segmentModal.classList.add('hidden'); editingIndex = null; }

  function saveSegmentFromModal() {
    const proj = getCurrentProject();
    if (!proj) return alert('No project');
    const seg = {
      start: Math.max(0, Number(segStart.value) || 0),
      duration: Math.max(0.1, Number(segDuration.value) || 0.1),
      title: segTitle.value || '(untitled)',
      remarks: segRemarks.value || '',
      color: segColor.value || '#00cc88'
    };
    if (editingIndex === null) {
      proj.segments.push(seg);
    } else {
      proj.segments[editingIndex] = seg;
    }
    proj.segments.sort((a,b)=>a.start - b.start);
    save();
    closeModal();
    renderUI();
  }

  // Timeline rendering
  function renderRuler() {
    ruler.innerHTML = '';
    const proj = getCurrentProject();
    if (!proj) return;
    const maxEnd = Math.max( Math.max(...proj.segments.map(s=>s.start + s.duration), 10), 30 );
    const pxWidth = Math.ceil(maxEnd * pxPerSec) + 200;
    timeline.style.width = pxWidth + 'px';
    ruler.style.width = pxWidth + 'px';

    const fragment = document.createDocumentFragment();
    const majorEvery = 5;
    for (let t=0; t<=maxEnd; t+=1) {
      const tick = document.createElement('div');
      tick.style.position = 'absolute';
      tick.style.left = (t*pxPerSec) + 'px';
      tick.style.top = '0';
      tick.style.height = (t % majorEvery === 0 ? '14px' : '8px');
      tick.style.borderLeft = '1px solid rgba(255,255,255,0.04)';
      tick.style.color = 'var(--muted)';
      tick.style.fontSize = '11px';
      tick.style.paddingLeft = '6px';
      tick.style.transform = 'translateX(-1px)';
      if (t % majorEvery === 0) tick.textContent = `${t}s`;
      fragment.appendChild(tick);
    }
    ruler.appendChild(fragment);
  }

  function renderTimeline() {
    timeline.innerHTML = '';
    const proj = getCurrentProject();
    if (!proj) return;
    proj.segments.forEach((s, index) => {
      const segEl = document.createElement('div');
      segEl.className = 'segment';
      const left = s.start * pxPerSec;
      const width = Math.max(8, s.duration * pxPerSec);
      segEl.style.left = left + 'px';
      segEl.style.width = width + 'px';
      segEl.style.background = s.color || '#00cc88';
      segEl.dataset.index = index;

      const title = document.createElement('div'); title.className = 'title';
      title.textContent = s.title || `(cam ${index+1})`;
      const meta = document.createElement('div'); meta.className = 'meta';
      meta.textContent = `${s.start}s • ${s.duration}s`;
      segEl.appendChild(title);
      segEl.appendChild(meta);

      const leftHandle = document.createElement('div'); leftHandle.className = 'left-handle';
      const rightHandle = document.createElement('div'); rightHandle.className = 'handle';
      segEl.appendChild(leftHandle);
      segEl.appendChild(rightHandle);

      timeline.appendChild(segEl);

      enableSegmentDragAndResize(segEl, index);
      segEl.addEventListener('dblclick', () => openEditModal(index));
      segEl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        seekTo(s.start);
        updatePlayhead();
      });
    });
  }

  // Drag and resize logic
  function enableSegmentDragAndResize(el, index) {
    const proj = getCurrentProject();
    let mode = null;
    let originX = 0;
    let originLeft = 0;
    let originWidth = 0;

    function onPointerDown(e) {
      e.preventDefault();
      const target = e.target;
      originX = e.clientX;
      originLeft = parseFloat(el.style.left);
      originWidth = parseFloat(el.style.width);

      if (target.classList.contains('handle')) mode = 'resize-right';
      else if (target.classList.contains('left-handle')) mode = 'resize-left';
      else mode = 'move';

      el.classList.add('dragging');
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    }
    function onPointerMove(e) {
      const dx = e.clientX - originX;
      if (!mode) return;
      if (mode === 'move') {
        const newLeft = Math.max(0, originLeft + dx);
        el.style.left = newLeft + 'px';
        const newStart = Math.max(0, Math.round((newLeft / pxPerSec) * 10) / 10);
        proj.segments[index].start = newStart;
      } else if (mode === 'resize-right') {
        const newWidth = Math.max(8, originWidth + dx);
        el.style.width = newWidth + 'px';
        const newDuration = Math.max(0.1, Math.round((newWidth / pxPerSec) * 10) / 10);
        proj.segments[index].duration = newDuration;
      } else if (mode === 'resize-left') {
        const newLeft = Math.max(0, originLeft + dx);
        const delta = originLeft - newLeft;
        const newWidth = Math.max(8, originWidth + delta);
        el.style.left = newLeft + 'px';
        el.style.width = newWidth + 'px';
        const newStart = Math.max(0, Math.round((newLeft / pxPerSec) * 10) / 10);
        const newDuration = Math.max(0.1, Math.round((newWidth / pxPerSec) * 10) / 10);
        proj.segments[index].start = newStart;
        proj.segments[index].duration = newDuration;
      }
      const meta = el.querySelector('.meta');
      meta.textContent = `${proj.segments[index].start}s • ${proj.segments[index].duration}s`;
    }
    function onPointerUp(e) {
      el.classList.remove('dragging');
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      mode = null;
      proj.segments.sort((a,b)=>a.start - b.start);
      save();
      renderUI();
    }

    el.addEventListener('pointerdown', onPointerDown);
  }

  // Unified playback helpers
  function getCurrentTime() {
    if (isYouTube && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
      return ytPlayer.getCurrentTime();
    }
    return video.currentTime || 0;
  }
  function seekTo(t) {
    if (isYouTube && ytPlayer && typeof ytPlayer.seekTo === 'function') {
      try { ytPlayer.seekTo(t, true); } catch(e) { console.warn('YT seek error', e); }
    } else {
      video.currentTime = t;
    }
  }
  function play() {
    if (isYouTube && ytPlayer && typeof ytPlayer.playVideo === 'function') return ytPlayer.playVideo();
    return video.play();
  }
  function pause() {
    if (isYouTube && ytPlayer && typeof ytPlayer.pauseVideo === 'function') return ytPlayer.pauseVideo();
    return video.pause();
  }

  function updatePlayhead() {
    const t = getCurrentTime() || 0;
    playhead.style.left = (t * pxPerSec) + 'px';
  }

  function timelineClickToSeek(e) {
    const rect = timeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = x / pxPerSec;
    seekTo(Math.max(0, t));
    updatePlayhead();
  }

  // segment playback control
  function startSegmentPlayback(index) {
    const proj = getCurrentProject();
    if (!proj || !proj.segments[index]) return;
    const seg = proj.segments[index];
    playingSegmentIndex = index;
    seekTo(seg.start);
    setTimeout(() => { play().catch?.(() => {}); }, 150);

    if (segmentPlayWatcher) clearInterval(segmentPlayWatcher);
    segmentPlayWatcher = setInterval(() => {
      try {
        const t = getCurrentTime();
        updatePlayhead();
        if (t >= seg.start + seg.duration - 0.05) {
          if (segmentLooping[index]) {
            seekTo(seg.start);
          } else {
            stopSegmentPlayback();
          }
        }
      } catch (e) { console.warn('segment watcher error', e); }
    }, 120);
  }

  function stopSegmentPlayback() {
    if (segmentPlayWatcher) { clearInterval(segmentPlayWatcher); segmentPlayWatcher = null; }
    playingSegmentIndex = null;
    pause();
    Array.from(segmentList.querySelectorAll('li')).forEach((li) => {
      const btn = li.querySelector('button');
      if (btn) btn.textContent = 'Play';
    });
  }

  // scale controls
  scaleRange.addEventListener('input', (e) => {
    pxPerSec = Number(e.target.value);
    scaleValue.textContent = `${pxPerSec} px/s`;
    localStorage.setItem('cuelike.scale', pxPerSec);
    renderUI();
  });

  // event wiring
  createProjectBtn.addEventListener('click', createProject);
  projectSelect.addEventListener('change', (e) => setCurrentProject(e.target.value));
  addSegmentBtn.addEventListener('click', () => openAddModal(Math.round(getCurrentTime() * 10) / 10));

  // Templates wiring
  addTemplateBtn.addEventListener('click', addTemplate);
  saveTplBtn.addEventListener('click', saveTemplateFromModal);
  cancelTplBtn.addEventListener('click', closeTemplateModal);
  templateModal.addEventListener('click', (e) => { if (e.target === templateModal) closeTemplateModal(); });
  tplTitle.addEventListener('input', updateTemplatePreview);
  tplColor.addEventListener('input', updateTemplatePreview);
  tplDuration.addEventListener('input', () => {
    // small inline validation appearance while typing
    const val = Number(tplDuration.value);
    if (!isFinite(val) || val <= 0) tplError.textContent = 'Duration must be > 0';
    else tplError.textContent = '';
    updateTemplatePreview();
  });
  importTemplatesBtn.addEventListener('click', () => {
    const json = prompt('Paste templates JSON to import');
    if (json) importTemplates(json);
  });
  exportTemplatesBtn.addEventListener('click', exportTemplates);

  saveSegBtn.addEventListener('click', saveSegmentFromModal);
  cancelSegBtn.addEventListener('click', closeModal);
  segmentModal.addEventListener('click', (e) => { if (e.target === segmentModal) closeModal(); });

  timeline.addEventListener('click', timelineClickToSeek);

  // video file load
  videoInput.addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    teardownYouTube();
    isYouTube = false;
    youtubePlayerDiv.classList.add('hidden');
    video.classList.remove('hidden');
    video.src = url;
    video.play().catch(()=>{});
  });

  // YouTube integration
  function createYouTubePlayer(videoId, startAt = 0) {
    teardownYouTube();
    youtubePlayerDiv.innerHTML = '';
    ytPlayer = new YT.Player('youtubePlayer', {
      videoId: videoId,
      playerVars: { autoplay: 0, controls: 1, rel: 0, modestbranding: 1, start: Math.floor(startAt) },
      events: {
        onReady: (e) => {
          isYouTube = true;
          video.classList.add('hidden');
          youtubePlayerDiv.classList.remove('hidden');
          updatePlayhead();
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) startYTPoll();
          else stopYTPoll();
        }
      }
    });
  }
  function teardownYouTube() {
    stopYTPoll();
    if (ytPlayer && typeof ytPlayer.destroy === 'function') {
      try { ytPlayer.destroy(); } catch(_) {}
    }
    ytPlayer = null;
    isYouTube = false;
    youtubePlayerDiv.innerHTML = '';
  }
  function startYTPoll() {
    if (ytPollId) return;
    ytPollId = setInterval(() => { try { updatePlayhead(); } catch(e){} }, 200);
  }
  function stopYTPoll() { if (ytPollId) { clearInterval(ytPollId); ytPollId = null; } }

  window.onYouTubeIframeAPIReady = function() { console.log('YouTube IFrame API ready'); };
  loadYoutubeBtn.addEventListener('click', () => {
    const id = extractVideoId(youtubeURL.value.trim());
    if (!id) return alert('Invalid YouTube URL');
    createYouTubePlayer(id, 0);
  });

  // Export / Import segments/projects
  exportBtn.addEventListener('click', () => {
    if (!projects.length) return alert('No projects to export');
    const wb = XLSX.utils.book_new();
    projects.forEach(p => {
      const data = p.segments.map((s,i)=>({
        number: i+1, start: s.start, duration: s.duration, title: s.title, remarks: s.remarks, color: s.color
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, p.name.substring(0,31));
    });
    XLSX.writeFile(wb, 'cuelike_projects.xlsx');
  });
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleImport);

  function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      workbook.SheetNames.forEach(name => {
        const sheet = workbook.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(sheet);
        const segments = rows.map(r => ({
          start: Number(r.start) || Number(r.Start) || 0,
          duration: Number(r.duration) || Number(r.Duration) || Number(r.length) || 5,
          title: r.title || r.Title || (r.name || ''),
          remarks: r.remarks || r.Remarks || '',
          color: r.color || r.Color || '#00cc88'
        }));
        projects.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2,6), name: name, segments });
      });
      save();
      renderUI();
    };
    reader.readAsArrayBuffer(file);
  }

  // double-click timeline to add segment
  timeline.addEventListener('dblclick', (e) => {
    const rect = timeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = Math.max(0, Math.round((x/pxPerSec) * 10)/10);
    openAddModal(t);
  });

  // initial render & seeds
  if (!projects.length) {
    projects = [{
      id: 'demo',
      name: 'Demo project',
      segments: [
        { start: 0, duration: 6, title: 'Intro', remarks: '', color:'#ffd166' },
        { start: 6.2, duration: 12, title: 'Scene A', remarks: '', color:'#06d6a0' },
        { start: 19, duration: 8, title: 'Scene B', remarks: '', color:'#118ab2' }
      ]
    }];
    currentProjectId = 'demo';
    save();
  } else {
    if (!currentProjectId && projects.length) currentProjectId = projects[0].id;
  }

  if (!templates || templates.length === 0) {
    templates = [
      { id: 't1', title: 'Intro', duration: 5, color: '#ffd166' },
      { id: 't2', title: 'Main', duration: 12, color: '#06d6a0' },
      { id: 't3', title: 'Outro', duration: 6, color: '#118ab2' }
    ];
    saveTemplates();
  }

  scaleRange.value = pxPerSec;
  scaleValue.textContent = `${pxPerSec} px/s`;

  video.addEventListener('timeupdate', updatePlayhead);

  renderUI();
})();