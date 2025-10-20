(function () {
  const html = document.documentElement;
  const themeToggle = document.getElementById('themeToggle');
  const angleRange = document.getElementById('angleRange');
  const angleOut = document.getElementById('angleOut');
  const angleLive = document.getElementById('angleLive');
  const randomizeBtn = document.getElementById('randomize');
  const resetBtn = document.getElementById('reset');
  const rangeHint = document.getElementById('rangeHint');
  const forearm = document.getElementById('forearm');
  const yearEl = document.getElementById('year');
  // Punching simulator elements
  const powerFill = document.getElementById('powerFill');
  const punchBtn = document.getElementById('punchBtn');
  const punchAngleOut = document.getElementById('punchAngle');
  const impactSpeedOut = document.getElementById('impactSpeed');
  const impactForceOut = document.getElementById('impactForce');
  const sFore = document.getElementById('s-fore');
  const target = document.getElementById('target');
  // Games dashboard elements
  const gamesGrid = document.getElementById('gamesGrid');
  const gamesEmpty = document.getElementById('gamesEmpty');
  const gameSearch = document.getElementById('gameSearch');
  const addGameBtn = document.getElementById('addGameBtn');
  const gameForm = document.getElementById('gameForm');
  const gameName = document.getElementById('gameName');
  const gameUrl = document.getElementById('gameUrl');
  const gameTags = document.getElementById('gameTags');
  const saveGame = document.getElementById('saveGame');
  const cancelGame = document.getElementById('cancelGame');

  // Init year
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // Theme persistence
  const savedTheme = localStorage.getItem('theme-preference');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    html.setAttribute('data-theme', savedTheme);
  }
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = html.getAttribute('data-theme') || 'auto';
      const next = current === 'light' ? 'dark' : current === 'dark' ? 'auto' : 'light';
      html.setAttribute('data-theme', next);
      if (next === 'auto') localStorage.removeItem('theme-preference');
      else localStorage.setItem('theme-preference', next);
    });
  }

  // Simulator logic
  const ELBOW_X = 200;
  const ELBOW_Y = 154;

  function setAngle(angle) {
    const clamped = Math.max(0, Math.min(150, Math.round(Number(angle) || 0)));
    if (angleRange) angleRange.value = String(clamped);
    if (angleOut) angleOut.value = `${clamped}\u00B0`;
    if (angleLive) angleLive.textContent = `Elbow angle ${clamped} degrees.`;

    // SVG rotation: negative to bend upward visually
    if (forearm) forearm.setAttribute('transform', `rotate(${-clamped} ${ELBOW_X} ${ELBOW_Y})`);

    if (rangeHint) {
      if (clamped >= 0 && clamped <= 150) {
        rangeHint.textContent = clamped === 90 ? 'Nice! 90° is a common ergonomic target' : 'Within typical range';
        rangeHint.style.color = '';
      } else {
        rangeHint.textContent = 'Outside typical range';
        rangeHint.style.color = 'var(--danger)';
      }
    }
  }

  if (angleRange) {
    angleRange.addEventListener('input', (e) => {
      const value = e.target.value;
      setAngle(value);
    });
  }

  if (randomizeBtn) {
    randomizeBtn.addEventListener('click', () => {
      const value = Math.floor(Math.random() * 151); // 0-150
      setAngle(value);
      // Brief highlight
      randomizeBtn.disabled = true;
      setTimeout(() => (randomizeBtn.disabled = false), 250);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => setAngle(30));
  }

  // Initialize from current range value
  setAngle(angleRange ? angleRange.value : 30);

  // -----------------------------
  // Punching simulator logic
  // -----------------------------
  const meter = { value: 0, dir: 1 };
  let rafId = null;
  let lastTs = 0;

  function tick(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(50, ts - lastTs); // clamp delta
    lastTs = ts;
    // Oscillate 0..100 at ~1.2s per cycle
    const speedPerMs = 100 / 600; // ~0.6% per ms -> ~1.0s up, 1.0s down
    meter.value += meter.dir * speedPerMs * dt;
    if (meter.value >= 100) { meter.value = 100; meter.dir = -1; }
    if (meter.value <= 0) { meter.value = 0; meter.dir = 1; }
    if (powerFill) {
      powerFill.style.width = meter.value.toFixed(1) + '%';
      powerFill.parentElement?.setAttribute('aria-valuenow', String(Math.round(meter.value)));
    }
    rafId = requestAnimationFrame(tick);
  }

  function startMeter() {
    if (rafId == null) rafId = requestAnimationFrame(tick);
  }

  function stopMeter() {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function computeImpact() {
    // Velocity proxy from meter (0..100 -> 0..1)
    const vNorm = meter.value / 100; // unitless
    // Angle factor: favor ~100-120° for an uppercut (heuristic bell curve)
    const angle = angleRange ? Number(angleRange.value) : 30;
    const mu = 110; // optimal angle
    const sigma = 25; // spread
    const angleFactor = Math.exp(-0.5 * Math.pow((angle - mu) / sigma, 2)); // 0..1

    // Simple physics-y mapping (not real biomechanics):
    // v (m/s) = vNorm * 7.5 (cap around trained punch speeds)
    const v = vNorm * 7.5;
    // Effective mass (kg) of forearm+hand segment
    const effectiveMass = 1.6;
    // Contact time (s) depends loosely on speed (faster -> shorter contact)
    const contactTime = 0.016 + (1 - vNorm) * 0.024; // 16–40 ms
    // Force estimate: F = (m * v) / t scaled by angle factor and a coupling constant
    const coupling = 1.15;
    const force = (effectiveMass * v / contactTime) * (0.6 + 0.4 * angleFactor) * coupling; // Newtons

    return { angle, v, force };
  }

  function animateStrike(result) {
    if (!sFore || !target) return;
    // Animate forearm snap and bag wobble
    // Base forearm rotation uses current elbow angle; we add a transient extra snap based on velocity
    const base = angleRange ? Number(angleRange.value) : 30;
    const snap = Math.min(25, (meter.value / 100) * 25);

    // Apply quick forward rotation then ease back
    const start = performance.now();
    const duration = 300;
    function step(ts) {
      const t = Math.min(1, (ts - start) / duration);
      const easeOut = 1 - Math.pow(1 - t, 3);
      const rot = -(base + snap * (1 - easeOut));
      sFore.setAttribute('transform', `rotate(${rot})`);
      // Target nudge
      const nudge = Math.min(10, result.force / 150); // px
      const wobble = Math.sin(t * Math.PI * 3) * (1 - t) * nudge;
      target.setAttribute('transform', `translate(${380 + wobble}, 80)`);
      if (t < 1) requestAnimationFrame(step);
      else {
        // restore base
        sFore.setAttribute('transform', `rotate(${-base})`);
        target.setAttribute('transform', 'translate(380, 80)');
      }
    }
    requestAnimationFrame(step);
  }

  function updateOutputs(res) {
    if (punchAngleOut) punchAngleOut.textContent = `${Math.round(res.angle)}°`;
    if (impactSpeedOut) impactSpeedOut.textContent = `${res.v.toFixed(2)} m/s`;
    if (impactForceOut) impactForceOut.textContent = `${Math.round(res.force)} N`;
  }

  function onPunch() {
    const result = computeImpact();
    updateOutputs(result);
    animateStrike(result);
  }

  if (punchBtn) {
    punchBtn.addEventListener('click', onPunch);
  }

  startMeter();

  // -----------------------------
  // Games dashboard
  // -----------------------------
  const STORAGE_KEY = 'games-dashboard:v1';
  const DEFAULT_GAMES = [
    { id: crypto.randomUUID(), name: '2048', url: 'https://play2048.co/', tags: ['puzzle'] },
    { id: crypto.randomUUID(), name: 'Tetris', url: 'https://tetris.com/play-tetris', tags: ['arcade'] },
    { id: crypto.randomUUID(), name: 'Chess.com', url: 'https://www.chess.com/play', tags: ['board','strategy'] },
  ];

  function readGames() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_GAMES;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULT_GAMES;
      return parsed;
    } catch {
      return DEFAULT_GAMES;
    }
  }

  function writeGames(games) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  }

  function normalizeTags(input) {
    if (!input) return [];
    return String(input)
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  function createGameCard(game) {
    const card = document.createElement('article');
    card.className = 'game-card';
    card.tabIndex = 0;

    const title = document.createElement('h3');
    title.textContent = game.name;
    card.appendChild(title);

    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'game-tags';
    for (const tag of game.tags || []) {
      const el = document.createElement('span');
      el.className = 'game-tag';
      el.textContent = tag;
      tagsWrap.appendChild(el);
    }
    card.appendChild(tagsWrap);

    const actions = document.createElement('div');
    actions.className = 'game-actions';
    const open = document.createElement('a');
    open.href = game.url;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.className = 'button';
    open.textContent = 'Play';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button button-secondary';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      const games = readGames().filter(g => g.id !== game.id);
      writeGames(games);
      render();
    });
    actions.appendChild(open);
    actions.appendChild(remove);
    card.appendChild(actions);

    return card;
  }

  function render(filter = '') {
    if (!gamesGrid || !gamesEmpty) return;
    gamesGrid.setAttribute('aria-busy', 'true');
    gamesGrid.innerHTML = '';
    const q = filter.trim().toLowerCase();
    const games = readGames().filter(g => {
      if (!q) return true;
      const hay = [g.name, g.url, ...(g.tags || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
    for (const game of games) {
      gamesGrid.appendChild(createGameCard(game));
    }
    gamesEmpty.hidden = games.length > 0;
    gamesGrid.setAttribute('aria-busy', 'false');
  }

  function openForm() {
    if (!gameForm) return;
    gameForm.hidden = false;
    gameName?.focus();
  }

  function closeForm() {
    if (!gameForm) return;
    gameForm.hidden = true;
    if (gameName) gameName.value = '';
    if (gameUrl) gameUrl.value = '';
    if (gameTags) gameTags.value = '';
  }

  if (addGameBtn) addGameBtn.addEventListener('click', openForm);
  if (cancelGame) cancelGame.addEventListener('click', closeForm);
  if (gameForm) {
    gameForm.addEventListener('submit', () => {
      const name = (gameName?.value || '').trim();
      const url = (gameUrl?.value || '').trim();
      if (!name || !url) return;
      const tags = normalizeTags(gameTags?.value || '');
      const next = [{ id: crypto.randomUUID(), name, url, tags }, ...readGames()].slice(0, 200);
      writeGames(next);
      closeForm();
      render(gameSearch?.value || '');
    });
  }

  if (gameSearch) {
    let debounce = 0;
    gameSearch.addEventListener('input', () => {
      clearTimeout(debounce);
      const value = gameSearch.value;
      debounce = setTimeout(() => render(value), 120);
    });
  }

  // Initial render
  render('');
})();


