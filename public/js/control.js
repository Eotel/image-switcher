(() => {
  const channel = new BroadcastChannel(CHANNEL_NAME);

  let manifest = null;
  let previewUrl = null;
  let programUrl = null;
  let allThumbElements = [];
  let cachedVisibleThumbs = [];
  let selectedIndex = -1;
  let currentSelectedEl = null;
  let currentOnAirEl = null;

  const thumbGrid = document.getElementById('thumb-grid');
  const previewImg = document.getElementById('preview-img');
  const previewPlaceholder = document.getElementById('preview-placeholder');
  const previewLoading = document.getElementById('preview-loading');
  const previewFilename = document.getElementById('preview-filename');
  const pgmImg = document.getElementById('pgm-img');
  const pgmPlaceholder = document.getElementById('pgm-placeholder');
  const pgmFilename = document.getElementById('pgm-filename');
  const personTabs = document.getElementById('person-tabs');
  const btnTake = document.getElementById('btn-take');
  const btnBlack = document.getElementById('btn-black');
  const btnOpenPgm = document.getElementById('btn-open-pgm');
  const gridArea = document.getElementById('grid-area');

  function createKeyBadge(text) {
    const span = document.createElement('span');
    span.className = 'key';
    span.textContent = text;
    return span;
  }

  function buildEncodedPath(prefix, personName, categoryName, filename) {
    return prefix + encodeURIComponent(personName) + '/' + encodeURIComponent(categoryName) + '/' + encodeURIComponent(filename);
  }

  function refreshVisibleThumbs() {
    cachedVisibleThumbs = allThumbElements.filter(function (el) {
      var section = el.closest('.person-section');
      return section && !section.classList.contains('hidden-person');
    });
  }

  async function init() {
    const res = await fetch('/api/manifest');
    manifest = await res.json();
    renderTabs();
    renderGrid();
    allThumbElements = Array.from(document.querySelectorAll('.thumb-item'));
    refreshVisibleThumbs();
  }

  function renderTabs() {
    for (const person of manifest.people) {
      const btn = document.createElement('button');
      btn.className = 'tab';
      btn.dataset.person = person.name;
      btn.textContent = person.name;
      btn.appendChild(createKeyBadge(String(person.index)));
      personTabs.appendChild(btn);
    }
  }

  function renderGrid() {
    thumbGrid.replaceChildren();

    for (const person of manifest.people) {
      const section = document.createElement('div');
      section.className = 'person-section';
      section.dataset.person = person.name;

      const personHeader = document.createElement('div');
      personHeader.className = 'person-header';
      personHeader.textContent = person.name;
      section.appendChild(personHeader);

      for (const category of person.categories) {
        const catHeader = document.createElement('div');
        catHeader.className = 'category-header';
        catHeader.textContent = category.name;
        section.appendChild(catHeader);

        const row = document.createElement('div');
        row.className = 'thumb-row';

        for (const image of category.images) {
          const item = document.createElement('div');
          item.className = 'thumb-item';
          item.dataset.imageUrl = buildEncodedPath('/images/', person.name, category.name, image.filename);
          item.dataset.person = person.name;

          const img = document.createElement('img');
          img.src = buildEncodedPath('/thumbnails/', person.name, category.name, image.filename);
          img.alt = image.filename;
          img.loading = 'lazy';
          item.appendChild(img);

          const nameDiv = document.createElement('div');
          nameDiv.className = 'thumb-name';
          nameDiv.textContent = image.filename.replace(/\.[^.]+$/, '');
          item.appendChild(nameDiv);

          row.appendChild(item);
        }

        section.appendChild(row);
      }

      thumbGrid.appendChild(section);
    }
  }

  function getThumbFilename(el) {
    return el ? (el.querySelector('.thumb-name')?.textContent || '') : '';
  }

  function setPreview(imageUrl, filename) {
    previewUrl = imageUrl;
    previewPlaceholder.classList.add('hidden');
    previewLoading.classList.remove('hidden');
    previewImg.classList.remove('visible');

    const loader = new Image();
    loader.onload = function () {
      previewImg.src = imageUrl;
      previewImg.classList.add('visible');
      previewLoading.classList.add('hidden');
    };
    loader.onerror = function () {
      previewLoading.textContent = 'Load failed';
    };
    loader.src = imageUrl;

    previewFilename.textContent = filename || '';

    if (currentSelectedEl) currentSelectedEl.classList.remove('selected');
    const target = allThumbElements.find(function (el) { return el.dataset.imageUrl === imageUrl; });
    if (target) {
      target.classList.add('selected');
      currentSelectedEl = target;
      selectedIndex = cachedVisibleThumbs.indexOf(target);
    }
  }

  function take() {
    if (!previewUrl) return;

    programUrl = previewUrl;

    pgmPlaceholder.classList.add('hidden');
    const loader = new Image();
    loader.onload = function () {
      pgmImg.src = programUrl;
      pgmImg.classList.add('visible');
    };
    loader.src = programUrl;
    pgmFilename.textContent = previewFilename.textContent;

    if (currentOnAirEl) currentOnAirEl.classList.remove('on-air');
    const target = allThumbElements.find(function (el) { return el.dataset.imageUrl === programUrl; });
    if (target) {
      target.classList.add('on-air');
      currentOnAirEl = target;
    }

    channel.postMessage({ type: 'take', imageUrl: programUrl });
  }

  function blackOut() {
    programUrl = null;
    pgmImg.classList.remove('visible');
    pgmPlaceholder.classList.remove('hidden');
    pgmPlaceholder.textContent = 'BLACK';
    pgmFilename.textContent = '';
    if (currentOnAirEl) {
      currentOnAirEl.classList.remove('on-air');
      currentOnAirEl = null;
    }
    channel.postMessage({ type: 'black' });
  }

  function filterPerson(personName) {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.person === personName);
    });

    document.querySelectorAll('.person-section').forEach(function (s) {
      if (personName === 'all') {
        s.classList.remove('hidden-person');
      } else {
        s.classList.toggle('hidden-person', s.dataset.person !== personName);
      }
    });

    refreshVisibleThumbs();
    selectedIndex = -1;
  }

  function navigateThumbs(direction) {
    if (cachedVisibleThumbs.length === 0) return;

    if (selectedIndex < 0) {
      selectedIndex = 0;
    } else {
      const currentEl = cachedVisibleThumbs[selectedIndex];
      if (!currentEl) {
        selectedIndex = 0;
      } else {
        const thumbWidth = currentEl.offsetWidth + 6;
        const cols = Math.floor((gridArea.clientWidth - 16) / thumbWidth) || 1;

        switch (direction) {
          case 'right':
            selectedIndex = Math.min(selectedIndex + 1, cachedVisibleThumbs.length - 1);
            break;
          case 'left':
            selectedIndex = Math.max(selectedIndex - 1, 0);
            break;
          case 'down':
            selectedIndex = Math.min(selectedIndex + cols, cachedVisibleThumbs.length - 1);
            break;
          case 'up':
            selectedIndex = Math.max(selectedIndex - cols, 0);
            break;
        }
      }
    }

    const el = cachedVisibleThumbs[selectedIndex];
    if (el) {
      setPreview(el.dataset.imageUrl, getThumbFilename(el));
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  thumbGrid.addEventListener('click', function (e) {
    const item = e.target.closest('.thumb-item');
    if (!item) return;
    setPreview(item.dataset.imageUrl, getThumbFilename(item));
  });

  thumbGrid.addEventListener('dblclick', function (e) {
    const item = e.target.closest('.thumb-item');
    if (!item) return;
    setPreview(item.dataset.imageUrl, getThumbFilename(item));
    take();
  });

  personTabs.addEventListener('click', function (e) {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    filterPerson(tab.dataset.person);
  });

  btnTake.addEventListener('click', take);
  btnBlack.addEventListener('click', blackOut);
  btnOpenPgm.addEventListener('click', function () {
    window.open('/program.html', 'pgm-output', 'width=1280,height=720');
  });

  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case ' ':
      case 'Enter':
        e.preventDefault();
        take();
        break;
      case 'b':
      case 'B':
        blackOut();
        break;
      case 'Escape':
        previewUrl = null;
        previewImg.classList.remove('visible');
        previewPlaceholder.classList.remove('hidden');
        previewFilename.textContent = '';
        if (currentSelectedEl) {
          currentSelectedEl.classList.remove('selected');
          currentSelectedEl = null;
        }
        selectedIndex = -1;
        break;
      case 'ArrowRight':
        e.preventDefault();
        navigateThumbs('right');
        break;
      case 'ArrowLeft':
        e.preventDefault();
        navigateThumbs('left');
        break;
      case 'ArrowDown':
        e.preventDefault();
        navigateThumbs('down');
        break;
      case 'ArrowUp':
        e.preventDefault();
        navigateThumbs('up');
        break;
      case '0':
        filterPerson('all');
        break;
      case '1':
      case '2':
      case '3':
      case '4':
      case '5': {
        const idx = parseInt(e.key) - 1;
        if (manifest && manifest.people[idx]) {
          filterPerson(manifest.people[idx].name);
        }
        break;
      }
    }
  });

  function initResizeHandles() {
    const STORAGE_KEY = 'image-switcher-pane-sizes';
    const MIN_LEFT_WIDTH = 240;
    const MAX_LEFT_WIDTH = 600;
    const MIN_SECTION_HEIGHT = 80;

    const monitors = document.getElementById('monitors');
    const previewSection = document.getElementById('preview-section');
    const pgmSection = document.getElementById('pgm-section');
    const handleH = document.getElementById('handle-h');
    const handleV = document.getElementById('handle-v');

    function setMonitorWidth(px) {
      monitors.style.width = px + 'px';
      monitors.style.minWidth = px + 'px';
    }

    function getHandleVSpace() {
      var style = getComputedStyle(handleV);
      return handleV.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    }

    function getVerticalAvailable() {
      return monitors.clientHeight - getHandleVSpace();
    }

    function applyVerticalRatio(ratio) {
      previewSection.style.flex = 'none';
      pgmSection.style.flex = 'none';
      var available = getVerticalAvailable();
      var previewH = Math.max(MIN_SECTION_HEIGHT, Math.min(available - MIN_SECTION_HEIGHT, available * ratio));
      previewSection.style.height = previewH + 'px';
      pgmSection.style.height = (available - previewH) + 'px';
    }

    function saveSizes() {
      try {
        var total = previewSection.offsetHeight + pgmSection.offsetHeight;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          leftWidth: monitors.offsetWidth,
          previewRatio: total > 0 ? previewSection.offsetHeight / total : 0.6
        }));
      } catch (_) { /* localStorage unavailable */ }
    }

    function restoreSizes() {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        var sizes = JSON.parse(raw);
        if (sizes.leftWidth) {
          setMonitorWidth(Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, sizes.leftWidth)));
        }
        if (sizes.previewRatio) {
          applyVerticalRatio(sizes.previewRatio);
        }
      } catch (_) { /* ignore */ }
    }

    function createDragHandler(handle, axis, onDrag) {
      var cls = 'resizing-' + axis;
      handle.addEventListener('mousedown', function (e) {
        e.preventDefault();
        var startPos = axis === 'h' ? e.clientX : e.clientY;
        var snapshot = onDrag.init(startPos);
        document.body.classList.add(cls);
        handle.classList.add('active');
        var rafId = 0;

        function onMove(ev) {
          cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(function () {
            var pos = axis === 'h' ? ev.clientX : ev.clientY;
            onDrag.move(snapshot, pos - startPos);
          });
        }

        function onUp() {
          cancelAnimationFrame(rafId);
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.body.classList.remove(cls);
          handle.classList.remove('active');
          saveSizes();
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    createDragHandler(handleH, 'h', {
      init: function () { return monitors.offsetWidth; },
      move: function (startWidth, delta) {
        setMonitorWidth(Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, startWidth + delta)));
      }
    });

    createDragHandler(handleV, 'v', {
      init: function () {
        previewSection.style.flex = 'none';
        pgmSection.style.flex = 'none';
        return { startH: previewSection.offsetHeight, available: getVerticalAvailable() };
      },
      move: function (snap, delta) {
        var newH = Math.max(MIN_SECTION_HEIGHT, Math.min(snap.available - MIN_SECTION_HEIGHT, snap.startH + delta));
        previewSection.style.height = newH + 'px';
        pgmSection.style.height = (snap.available - newH) + 'px';
      }
    });

    var resizeRafId = 0;
    window.addEventListener('resize', function () {
      cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(function () {
        var w = monitors.offsetWidth;
        if (w > MAX_LEFT_WIDTH) setMonitorWidth(MAX_LEFT_WIDTH);
        if (w < MIN_LEFT_WIDTH) setMonitorWidth(MIN_LEFT_WIDTH);
        if (pgmSection.style.height) {
          var total = previewSection.offsetHeight + pgmSection.offsetHeight;
          if (total > 0) applyVerticalRatio(previewSection.offsetHeight / total);
        }
      });
    });

    restoreSizes();
  }

  init();
  initResizeHandles();
})();
