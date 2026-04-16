const SCREEN_IDS = ['menu-screen', 'game-screen', 'win-screen', 'lose-screen', 'leaderboard-screen'];
const LOOK_FREEZE_MAX_MS = 10000;
const LOOK_FREEZE_COOLDOWN_MS = 10000;
const REVEAL_DURATION_MS = 10000;
const FORTIFY_DURATION_MS = 30000;
const STEALTH_DURATION_MS = 6000;
const MONSTER_STUN_MS = 3000;
const MONSTER_FLOOR_MS = 5000;
const MONSTER_DROP_LOCK_MS = 1600;
const QUAKE_WARNING_MS = 2500;
const QUAKE_ACTIVE_MS = 5000;
const FLOOR_TRANSITION_MS = 2200;

const BOX_TYPES = {
  normal: { label: 'Обычный', stabilityRange: [45, 60], blocks: true },
  light: { label: 'Лёгкий', stabilityRange: [20, 30], blocks: false },
  anchor: { label: 'Якорь', stabilityRange: [90, 120], blocks: true },
  heavy: { label: 'Тяжёлый', stabilityRange: [90, 120], blocks: true, wide: true },
  rotten: { label: 'Гнилой', stabilityRange: [34, 48], blocks: true, faultPerSecond: 0.085 },
  safe: { label: 'Сейф', stabilityRange: [95, 130], blocks: true, reward: true }
};

const FLOOR_CONFIGS = [
  { id: 1, name: 'Der Lagerraum', subtitle: 'Склад', width: 4, height: 6, shape: 'rect', anchors: 1, lights: 0, rotten: 0, heavy: 0, safe: 0, ceilingMoveMs: 4000, floorMoveMs: 6000, jumpDistance: 0, jumpCooldownMs: 0, quakes: false, autoJumpIfIdleMs: 0, returnJumpToPlayer: false, midQuakeAfterMs: 0 },
  { id: 2, name: 'Das Archiv', subtitle: 'Архив', width: 5, height: 6, shape: 'rect', anchors: 1, lights: 4, rotten: 4, heavy: 0, safe: 0, ceilingMoveMs: 3500, floorMoveMs: 5800, jumpDistance: 0, jumpCooldownMs: 0, quakes: true, autoJumpIfIdleMs: 0, returnJumpToPlayer: false, midQuakeAfterMs: 0 },
  { id: 3, name: 'Die Fabrik', subtitle: 'Цех', width: 5, height: 8, shape: 'rect', anchors: 4, lights: 4, rotten: 4, heavy: 4, safe: 0, ceilingMoveMs: 3000, floorMoveMs: 5600, jumpDistance: 3, jumpCooldownMs: 4000, quakes: true, autoJumpIfIdleMs: 0, returnJumpToPlayer: false, midQuakeAfterMs: 0 },
  { id: 4, name: 'Die Bibliothek', subtitle: 'Библиотека', width: 5, height: 8, shape: 'library-l', anchors: 4, lights: 4, rotten: 4, heavy: 4, safe: 3, ceilingMoveMs: 3000, floorMoveMs: 5400, jumpDistance: 3, jumpCooldownMs: 4000, quakes: true, autoJumpIfIdleMs: 0, returnJumpToPlayer: true, midQuakeAfterMs: 0 },
  { id: 5, name: 'Der Turm', subtitle: 'Финал', width: 6, height: 10, shape: 'rect', anchors: 6, lights: 6, rotten: 6, heavy: 6, safe: 4, ceilingMoveMs: 2500, floorMoveMs: 5200, jumpDistance: 3, jumpCooldownMs: 3500, quakes: true, autoJumpIfIdleMs: 5000, returnJumpToPlayer: true, midQuakeAfterMs: 24000 }
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
  let normalized = angle % (Math.PI * 2);
  if (normalized > Math.PI) {
    normalized -= Math.PI * 2;
  }
  if (normalized <= -Math.PI) {
    normalized += Math.PI * 2;
  }
  return normalized;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function tileKey(x, y) {
  return `${x}:${y}`;
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function randomChoice(items) {
  if (!items.length) {
    return null;
  }
  return items[randomInt(0, items.length - 1)];
}

function formatSeconds(ms) {
  return (Math.max(0, ms) / 1000).toFixed(1);
}

class Leaderboard {
  constructor() {
    this.key = 'turm_leaderboard';
  }

  getScores() {
    try {
      return JSON.parse(localStorage.getItem(this.key)) || [];
    } catch (error) {
      console.warn('Failed to read leaderboard:', error);
      return [];
    }
  }

  addScore(entry) {
    const scores = this.getScores();
    scores.push(entry);
    scores.sort((left, right) => {
      if (right.levelReached !== left.levelReached) {
        return right.levelReached - left.levelReached;
      }
      if (right.openedHatches !== left.openedHatches) {
        return right.openedHatches - left.openedHatches;
      }
      if (right.accuracy !== left.accuracy) {
        return right.accuracy - left.accuracy;
      }
      return left.durationMs - right.durationMs;
    });
    localStorage.setItem(this.key, JSON.stringify(scores.slice(0, 20)));
  }

  render() {
    const tbody = document.getElementById('leaderboard-body');
    const empty = document.getElementById('leaderboard-empty');
    const scores = this.getScores();

    tbody.innerHTML = '';

    if (!scores.length) {
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');

    scores.forEach((score, index) => {
      const row = document.createElement('tr');
      if (index < 3) {
        row.className = `rank-${index + 1}`;
      }

      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${this._escapeHtml(score.name)}</td>
        <td>${this._escapeHtml(score.runName)}</td>
        <td>${score.levelReached}</td>
        <td>${score.accuracy}%</td>
      `;
      tbody.appendChild(row);
    });
  }

  _escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }
}

class Game {
  constructor() {
    this.state = 'menu';
    this.renderer = null;
    this.audio = null;
    this.questionManager = null;
    this.leaderboard = new Leaderboard();

    this.playerName = 'Spieler';
    this.runName = 'Безымянный спуск';
    this.langLevel = DEFAULT_CEFR_LEVEL;
    this.lexicalTopic = null;
    this.slotConfigs = [];

    this.currentFloor = 1;
    this.floorConfig = null;
    this.floorData = null;
    this.player = { x: 0, y: 0, facing: 0, lookMode: 'down', cameraYaw: 0, cameraPitch: 0 };
    this.monster = null;

    this.currentSlotId = null;
    this.currentQuestion = null;
    this.questionFeedback = null;
    this.questionAnsweredIndex = null;
    this.questionPanelYaw = 0;
    this.targetMode = null;
    this.targetSourceSlotId = null;
    this.movesLeft = 0;
    this.slotCooldowns = Object.create(null);

    this.lookFreezeBudgetMs = LOOK_FREEZE_MAX_MS;
    this.lookFreezeCooldownUntil = 0;

    this.quake = { phase: 'idle', warnUntil: 0, activeUntil: 0, reason: '' };

    this.runStartedAt = 0;
    this.currentFloorStartedAt = 0;
    this.questionsAnswered = 0;
    this.questionsCorrect = 0;
    this.runOpenedHatches = 0;
    this.deathInfo = null;

    this.messageTimeoutId = null;
    this.transitionTimeoutId = null;
    this.floorTransitionTimeoutId = null;
    this.nextUiRefreshAt = 0;
    this.uiDirty = true;
    this.cameraDrag = { active: false, pointerId: null, lastX: 0, lastY: 0, moved: false };

    this.ui = this._cacheUi();
    this._bindUi();
  }

  _cacheUi() {
    return {
      canvas: document.getElementById('game-canvas'),
      loadingOverlay: document.getElementById('loading-overlay'),
      loadingText: document.getElementById('loading-text'),
      messageBanner: document.getElementById('message-banner'),
      transitionBanner: document.getElementById('transition-banner'),
      deathOverlay: document.getElementById('death-overlay'),
      floorTitle: document.getElementById('floor-title'),
      floorMeta: document.getElementById('floor-meta'),
      runNameDisplay: document.getElementById('run-name-display'),
      lexicalTopicDisplay: document.getElementById('lexical-topic-display'),
      monsterDisplay: document.getElementById('monster-display'),
      movesDisplay: document.getElementById('moves-display'),
      hatchDisplay: document.getElementById('hatch-display'),
      freezeLabel: document.getElementById('freeze-label'),
      freezeMeter: document.getElementById('freeze-meter'),
      quakeDisplay: document.getElementById('quake-display'),
      statusEffects: document.getElementById('status-effects'),
      lookUpButton: document.getElementById('look-up-btn'),
      lookDownButton: document.getElementById('look-down-btn'),
      useHatchButton: document.getElementById('use-hatch-btn'),
      boardHeading: document.getElementById('board-heading'),
      boardPanel: document.getElementById('board-panel'),
      boardLegend: document.getElementById('board-legend'),
      topicPanel: document.getElementById('topic-panel'),
      topicButtons: document.getElementById('topic-buttons'),
      actionPanel: document.getElementById('action-panel'),
      actionPrompt: document.getElementById('action-prompt'),
      targetPanel: document.getElementById('target-panel'),
      targetPrompt: document.getElementById('target-prompt'),
      targetGrid: document.getElementById('target-grid'),
      cancelTargetButton: document.getElementById('cancel-target-btn'),
      winStats: document.getElementById('win-stats'),
      loseTitle: document.getElementById('lose-title'),
      loseStats: document.getElementById('lose-stats'),
      loseMessage: document.getElementById('lose-message')
    };
  }

  _bindUi() {
    this.ui.lookUpButton.addEventListener('click', () => this.setLookMode('up'));
    this.ui.lookDownButton.addEventListener('click', () => this.setLookMode('down'));
    this.ui.useHatchButton.addEventListener('click', () => this.tryUseHatch());
    this.ui.cancelTargetButton.addEventListener('click', () => this.cancelTargeting());

    document.querySelectorAll('.dir-btn').forEach((button) => {
      button.addEventListener('click', () => {
        this.movePlayer(button.dataset.dir);
      });
    });

    this._bindCanvasCameraControls();
  }

  _bindCanvasCameraControls() {
    const canvas = this.ui.canvas;
    const finishDrag = (event) => {
      if (!this.cameraDrag.active || event.pointerId !== this.cameraDrag.pointerId) {
        return;
      }

      const shouldAnswer = this.state === 'question' && !this.cameraDrag.moved;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }

      this.cameraDrag.active = false;
      this.cameraDrag.pointerId = null;
      this.cameraDrag.lastX = 0;
      this.cameraDrag.lastY = 0;
      this.cameraDrag.moved = false;

      if (shouldAnswer) {
        this._answerQuestionFromView();
      }
    };

    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || this.state === 'loading' || this.state === 'won' || this.state === 'lost') {
        return;
      }

      this.cameraDrag.active = true;
      this.cameraDrag.pointerId = event.pointerId;
      this.cameraDrag.lastX = event.clientX;
      this.cameraDrag.lastY = event.clientY;
      this.cameraDrag.moved = false;
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!this.cameraDrag.active || event.pointerId !== this.cameraDrag.pointerId) {
        return;
      }

      const deltaX = event.clientX - this.cameraDrag.lastX;
      const deltaY = event.clientY - this.cameraDrag.lastY;
      this.cameraDrag.lastX = event.clientX;
      this.cameraDrag.lastY = event.clientY;
      if (Math.abs(deltaX) < 0.75 && Math.abs(deltaY) < 0.75) {
        return;
      }

      this.cameraDrag.moved = true;
      this.adjustCameraYaw(-deltaX * 0.0125);
      this.adjustCameraPitch(-deltaY * 0.0085);
    });

    canvas.addEventListener('pointerup', finishDrag);
    canvas.addEventListener('pointercancel', finishDrag);
  }

  async init(settings, reuseQuestions = false, preserveRunProgress = false) {
    this._clearAllTimeouts();
    this._disposeRuntime();
    this._applySettings(settings);
    this._prepareRunState(preserveRunProgress);
    this._setActiveScreen('game-screen');
    this._showLoading('Башня строит следующий этаж...');
    this._hidePanels();
    this.ui.transitionBanner.classList.add('hidden');
    this.ui.deathOverlay.classList.remove('active');
    this.deathInfo = null;

    if (!reuseQuestions || !this.questionManager) {
      this.questionManager = new QuestionManager(this.langLevel);
    }
    this.questionManager.setLevel(this.langLevel);
    this.questionManager.setLexicalTopic(this.lexicalTopic);
    this.questionManager.configureSlots(this.slotConfigs);

    this.renderer = new TowerRenderer(this.ui.canvas);
    this.audio = new AudioManager();
    this.audio.init();

    this.floorData = this._createFloorRuntime(this.currentFloor);
    this.floorConfig = this.floorData.config;
    this.player = {
      x: this.floorData.start.x,
      y: this.floorData.start.y,
      facing: 0,
      lookMode: 'down',
      cameraYaw: this._facingToYaw(0),
      cameraPitch: 0
    };
    this.monster = this._createMonsterState(this.floorData);
    this.currentFloorStartedAt = performance.now();

    await Promise.allSettled([this.renderer.ensureModelsLoaded(), this.questionManager.prefetchAll()]);

    this.renderer.buildFloor(this.floorData);
    this.renderer.setPlayerState(this.player, true);
    this.state = 'topic_select';
    this._showTopicPanel();
    this._hideLoading();
    this._showMessage('Башня слушает. Чтобы идти, нужно отвечать точно.', 2400);
    this._markUiDirty(true);
    this._syncRenderer(performance.now());

    this.renderer.startLoop((deltaSeconds) => {
      this._update(deltaSeconds);
    });
  }

  _applySettings(settings) {
    this.playerName = settings.playerName || 'Spieler';
    this.runName = settings.runName || 'Безымянный спуск';
    this.langLevel = settings.langLevel || DEFAULT_CEFR_LEVEL;
    this.lexicalTopic = settings.lexicalTopic || null;
    this.slotConfigs = (settings.slotConfigs || []).map((config) => ({
      slotDef: config.slotDef,
      grammarTopic: config.grammarTopic
    }));
    this.currentFloor = settings.level || 1;
  }

  _prepareRunState(preserveRunProgress) {
    this.state = 'loading';
    this.movesLeft = 0;
    this.currentSlotId = null;
    this.currentQuestion = null;
    this.questionFeedback = null;
    this.questionAnsweredIndex = null;
    this.questionPanelYaw = 0;
    this.targetMode = null;
    this.targetSourceSlotId = null;
    this.slotCooldowns = Object.create(null);
    this.lookFreezeBudgetMs = LOOK_FREEZE_MAX_MS;
    this.lookFreezeCooldownUntil = 0;
    this.quake = { phase: 'idle', warnUntil: 0, activeUntil: 0, reason: '' };
    this.ui.messageBanner.classList.add('hidden');

    if (!preserveRunProgress) {
      this.runStartedAt = performance.now();
      this.questionsAnswered = 0;
      this.questionsCorrect = 0;
      this.runOpenedHatches = 0;
    }
  }

  _createFloorRuntime(level) {
    const config = FLOOR_CONFIGS[level - 1];
    const activeTiles = this._buildActiveTiles(config);
    const activeTileKeys = new Set(activeTiles.map((tile) => tileKey(tile.x, tile.y)));
    const start = this._pickStartTile(activeTiles, config);
    const hatches = this._generateHatches(activeTiles, start);
    const boxes = this._generateBoxes(activeTiles, start, config);

    return {
      config,
      activeTiles,
      activeTileKeys,
      start,
      hatches,
      hatchMap: Object.fromEntries(hatches.map((hatch) => [tileKey(hatch.x, hatch.y), hatch])),
      boxes,
      debrisMap: Object.create(null),
      plannedQuakeTriggered: false,
      lastPlayerMoveAt: performance.now()
    };
  }

  _buildActiveTiles(config) {
    const tiles = [];
    for (let y = 0; y < config.height; y += 1) {
      for (let x = 0; x < config.width; x += 1) {
        if (config.shape === 'library-l' && x >= 3 && y <= 2) {
          continue;
        }
        tiles.push({ x, y });
      }
    }
    return tiles;
  }

  _pickStartTile(activeTiles, config) {
    const edgeTiles = activeTiles.filter((tile) =>
      tile.x === 0 || tile.y === 0 || tile.x === config.width - 1 || tile.y === config.height - 1
    );

    const sorted = [...edgeTiles].sort((left, right) => {
      if (right.y !== left.y) {
        return right.y - left.y;
      }
      return left.x - right.x;
    });

    return { ...sorted[0] };
  }

  _generateHatches(activeTiles, start) {
    const candidates = activeTiles.filter((tile) => manhattan(tile, start) >= 2);
    let best = null;
    let bestScore = -Infinity;

    for (let attempt = 0; attempt < 280; attempt += 1) {
      const picked = shuffleArray(candidates).slice(0, 3);
      if (picked.length < 3) {
        continue;
      }

      const distances = [manhattan(picked[0], picked[1]), manhattan(picked[0], picked[2]), manhattan(picked[1], picked[2])];
      const minDistance = Math.min(...distances);
      const variance = Math.max(...distances) - Math.min(...distances);
      const startPenalty = picked.reduce((sum, tile) => sum + manhattan(tile, start), 0);
      const score = minDistance * 10 - variance * 4 + startPenalty;

      if (minDistance >= 3 && score > bestScore) {
        bestScore = score;
        best = picked;
      }
    }

    const chosen = best || shuffleArray(candidates).slice(0, 3);
    return chosen.map((tile, index) => ({
      id: `hatch-${index + 1}`,
      x: tile.x,
      y: tile.y,
      opened: false
    }));
  }

  _generateBoxes(activeTiles, start, config) {
    const boxes = Object.create(null);
    const reserved = new Set();
    const eligible = activeTiles.filter((tile) => manhattan(tile, start) >= 2);

    activeTiles.forEach((tile) => {
      boxes[tileKey(tile.x, tile.y)] = this._createBox(tile.x, tile.y, 'normal');
    });

    const assignType = (count, type) => {
      const pool = eligible.filter((tile) => !reserved.has(tileKey(tile.x, tile.y)));
      shuffleArray(pool).slice(0, count).forEach((tile) => {
        const key = tileKey(tile.x, tile.y);
        reserved.add(key);
        boxes[key] = this._createBox(tile.x, tile.y, type);
      });
    };

    assignType(config.anchors, 'anchor');
    assignType(config.lights, 'light');
    assignType(config.rotten, 'rotten');
    assignType(config.heavy, 'heavy');
    assignType(config.safe, 'safe');

    return boxes;
  }

  _createBox(x, y, type) {
    const template = BOX_TYPES[type];
    const maxStability = randomInt(template.stabilityRange[0], template.stabilityRange[1]);

    return {
      key: tileKey(x, y),
      x,
      y,
      type,
      maxStability,
      stability: maxStability,
      revealUntil: 0,
      fortifiedUntil: 0,
      fallen: false,
      fallCause: null,
      orientation: Math.random() > 0.5 ? 'horizontal' : 'vertical'
    };
  }

  _createMonsterState(floorData) {
    const liveBoxes = Object.values(floorData.boxes).filter((box) => !box.fallen);
    const farthest = [...liveBoxes].sort((left, right) => manhattan(right, floorData.start) - manhattan(left, floorData.start))[0];

    return {
      state: 'ceiling',
      x: farthest?.x || floorData.start.x,
      y: farthest?.y || 0,
      nextMoveAt: performance.now() + floorData.config.ceilingMoveMs,
      stateUntil: 0,
      hiddenUntil: 0,
      jumpCooldownUntil: 0,
      dropChargeSince: 0
    };
  }

  _update(deltaSeconds) {
    if (this.state === 'menu' || !this.floorData || !this.renderer) {
      return;
    }

    const now = performance.now();
    const deltaMs = deltaSeconds * 1000;

    this._updateLookFreeze(now, deltaMs);
    this._updateQuake(now);
    this._updateBoxes(now, deltaSeconds);

    if (this.state !== 'lost' && this.state !== 'won') {
      this._updateMonster(now);
      this._updatePlannedQuake(now);
    }

    if (now >= this.nextUiRefreshAt || this.uiDirty) {
      this._refreshUi(now);
      this.nextUiRefreshAt = now + 120;
      this.uiDirty = false;
    }

    this._syncRenderer(now);
  }

  _updateLookFreeze(now, deltaMs) {
    if (this.lookFreezeCooldownUntil && now >= this.lookFreezeCooldownUntil) {
      this.lookFreezeCooldownUntil = 0;
      this.lookFreezeBudgetMs = LOOK_FREEZE_MAX_MS;
      this._markUiDirty();
    }

    if (this.player.lookMode === 'up' && this.monster && this.monster.state === 'ceiling' && !this.lookFreezeCooldownUntil && this.lookFreezeBudgetMs > 0) {
      this.lookFreezeBudgetMs = Math.max(0, this.lookFreezeBudgetMs - deltaMs);
      if (this.lookFreezeBudgetMs === 0) {
        this.lookFreezeCooldownUntil = now + LOOK_FREEZE_COOLDOWN_MS;
      }
      this._markUiDirty();
    }
  }

  _updateQuake(now) {
    if (this.quake.phase === 'warning' && now >= this.quake.warnUntil) {
      this.quake.phase = 'active';
      this.audio.playQuakeImpact();
      this.renderer.shake(0.18, 850);
      this._showMessage('Башню тряхнуло. Потолок стареет быстрее.', 1800);
      this._markUiDirty();
      return;
    }

    if (this.quake.phase === 'active' && now >= this.quake.activeUntil) {
      this.quake.phase = 'idle';
      this.quake.reason = '';
      this._markUiDirty();
    }
  }

  _updatePlannedQuake(now) {
    if (!this.floorConfig.midQuakeAfterMs || this.floorData.plannedQuakeTriggered || this.quake.phase !== 'idle') {
      return;
    }

    if (now - this.currentFloorStartedAt >= this.floorConfig.midQuakeAfterMs) {
      this.floorData.plannedQuakeTriggered = true;
      this._scheduleQuake('Башня сама пошла волной.');
    }
  }

  _updateBoxes(now, deltaSeconds) {
    const multiplier = this.quake.phase === 'active' ? 4 : 1;

    Object.values(this.floorData.boxes).forEach((box) => {
      if (box.fallen) {
        return;
      }

      if (box.revealUntil && now >= box.revealUntil) {
        box.revealUntil = 0;
      }
      if (box.fortifiedUntil && now >= box.fortifiedUntil) {
        box.fortifiedUntil = 0;
      }
      if (box.fortifiedUntil > now) {
        return;
      }

      box.stability = Math.max(0, box.stability - deltaSeconds * multiplier);

      if (box.type === 'rotten' && Math.random() < BOX_TYPES.rotten.faultPerSecond * deltaSeconds) {
        box.stability = 0;
      }

      if (box.stability <= 0) {
        this._dropBox(box, 'decay');
      }
    });
  }

  _updateMonster(now) {
    if (!this.monster) {
      return;
    }

    if (this.monster.state === 'stunned' && now >= this.monster.stateUntil) {
      this.monster.state = 'floor';
      this.monster.stateUntil = now + MONSTER_FLOOR_MS;
      this.monster.nextMoveAt = now + this.floorConfig.floorMoveMs;
      this.monster.dropChargeSince = 0;
      this._markUiDirty();
    }

    if (this.monster.state === 'floor' && now >= this.monster.stateUntil) {
      this._returnMonsterToCeiling(now);
      this._markUiDirty();
    }

    const ceilingFrozen = this._isCeilingMonsterFrozen(now);

    if (this.monster.state === 'ceiling') {
      if (!ceilingFrozen && now >= this.monster.nextMoveAt) {
        this._moveMonsterOnCeiling(now);
      }

      if (this.floorConfig.autoJumpIfIdleMs && !ceilingFrozen && now >= this.monster.jumpCooldownUntil) {
        if (now - this.floorData.lastPlayerMoveAt >= this.floorConfig.autoJumpIfIdleMs) {
          this._jumpMonsterToward(this.player.x, this.player.y);
          this.monster.nextMoveAt = now + this.floorConfig.ceilingMoveMs;
          this.monster.jumpCooldownUntil = now + this.floorConfig.jumpCooldownMs;
          this._showMessage('Der Fehler сорвался в длинный прыжок над вами.', 1300);
        }
      }

      if (this.monster.x === this.player.x && this.monster.y === this.player.y && this._getLiveBox(this.player.x, this.player.y)) {
        if (!this.monster.dropChargeSince) {
          this.monster.dropChargeSince = now;
        }
        if (!ceilingFrozen && now - this.monster.dropChargeSince >= MONSTER_DROP_LOCK_MS) {
          const box = this._getLiveBox(this.player.x, this.player.y);
          if (box) {
            this._dropBox(box, 'monster');
          }
          this.monster.dropChargeSince = 0;
        }
      } else {
        this.monster.dropChargeSince = 0;
      }
    }

    if (this.monster.state === 'floor' && now >= this.monster.nextMoveAt) {
      this._moveMonsterOnFloor(now);
    }
  }

  _isCeilingMonsterFrozen(now) {
    return this.monster.state === 'ceiling' && this.player.lookMode === 'up' && !this.lookFreezeCooldownUntil && this.lookFreezeBudgetMs > 0;
  }

  _moveMonsterOnCeiling(now) {
    const hidden = this.monster.hiddenUntil > now;

    if (!hidden && this.floorConfig.jumpDistance > 0 && now >= this.monster.jumpCooldownUntil && manhattan(this.monster, this.player) >= this.floorConfig.jumpDistance && Math.random() > 0.45) {
      this._jumpMonsterToward(this.player.x, this.player.y);
      this.monster.jumpCooldownUntil = now + this.floorConfig.jumpCooldownMs;
    } else {
      this._stepMonsterToward(hidden ? this._randomNeighbor(this.monster) : this.player, false);
    }

    this.monster.nextMoveAt = now + this.floorConfig.ceilingMoveMs;
    this._markUiDirty();
  }

  _moveMonsterOnFloor(now) {
    const hidden = this.monster.hiddenUntil > now;
    this._stepMonsterToward(hidden ? this._randomNeighbor(this.monster) : this.player, true);
    this.monster.nextMoveAt = now + this.floorConfig.floorMoveMs;

    if (this.monster.x === this.player.x && this.monster.y === this.player.y) {
      this.audio.playMonsterGrab();
      this._lose('monster');
      return;
    }

    this._markUiDirty();
  }

  _jumpMonsterToward(targetX, targetY) {
    const dx = targetX - this.monster.x;
    const dy = targetY - this.monster.y;
    let nextX = this.monster.x;
    let nextY = this.monster.y;

    if (Math.abs(dx) >= Math.abs(dy)) {
      nextX += Math.sign(dx || 1) * Math.min(this.floorConfig.jumpDistance, Math.abs(dx));
    } else {
      nextY += Math.sign(dy || 1) * Math.min(this.floorConfig.jumpDistance, Math.abs(dy));
    }

    if (this._isActiveTile(nextX, nextY)) {
      this.monster.x = nextX;
      this.monster.y = nextY;
    }
  }

  _stepMonsterToward(target, ignoreDebris) {
    const options = [
      { x: this.monster.x + 1, y: this.monster.y },
      { x: this.monster.x - 1, y: this.monster.y },
      { x: this.monster.x, y: this.monster.y + 1 },
      { x: this.monster.x, y: this.monster.y - 1 }
    ].filter((cell) => this._isActiveTile(cell.x, cell.y) && (ignoreDebris || !this._isBlocked(cell.x, cell.y)));

    if (!options.length) {
      return;
    }

    const sorted = options.sort((left, right) => manhattan(left, target) - manhattan(right, target));
    this.monster.x = sorted[0].x;
    this.monster.y = sorted[0].y;
  }

  _randomNeighbor(origin) {
    const neighbors = [
      { x: origin.x + 1, y: origin.y },
      { x: origin.x - 1, y: origin.y },
      { x: origin.x, y: origin.y + 1 },
      { x: origin.x, y: origin.y - 1 }
    ].filter((cell) => this._isActiveTile(cell.x, cell.y));

    return randomChoice(neighbors) || origin;
  }

  _returnMonsterToCeiling(now) {
    const liveBoxes = Object.values(this.floorData.boxes).filter((box) => !box.fallen);
    if (!liveBoxes.length) {
      this.monster.state = 'ceiling';
      this.monster.nextMoveAt = now + this.floorConfig.ceilingMoveMs;
      return;
    }

    const target = this.floorConfig.returnJumpToPlayer
      ? [...liveBoxes].sort((left, right) => manhattan(left, this.player) - manhattan(right, this.player))[0]
      : [...liveBoxes].sort((left, right) => manhattan(left, this.monster) - manhattan(right, this.monster))[0];

    this.monster.state = 'ceiling';
    this.monster.x = target.x;
    this.monster.y = target.y;
    this.monster.nextMoveAt = now + this.floorConfig.ceilingMoveMs;
    this.monster.stateUntil = 0;
    this.monster.dropChargeSince = 0;
  }

  _scheduleQuake(reason) {
    if (!this.floorConfig.quakes || this.quake.phase !== 'idle') {
      return;
    }

    const now = performance.now();
    this.quake.phase = 'warning';
    this.quake.warnUntil = now + QUAKE_WARNING_MS;
    this.quake.activeUntil = now + QUAKE_WARNING_MS + QUAKE_ACTIVE_MS;
    this.quake.reason = reason;
    this.audio.playQuakeWarning();
    this._showMessage(`Толчок назревает: ${reason}`, 2000);
    this._markUiDirty();
  }

  _dropBox(box, cause) {
    if (!box || box.fallen || this.state === 'lost' || this.state === 'won') {
      return;
    }

    box.fallen = true;
    box.fallCause = cause;
    this.audio.playBoxFall();
    this.renderer.shake(0.09, 360);

    if (box.type === 'safe') {
      this._grantSafeReward();
    }

    const affectedTiles = this._getDebrisTilesForBox(box);
    affectedTiles.forEach((tile) => {
      this.floorData.debrisMap[tileKey(tile.x, tile.y)] = { x: tile.x, y: tile.y, source: box.type };
    });

    if (this.monster.state === 'ceiling' && this.monster.x === box.x && this.monster.y === box.y) {
      this._sendMonsterToFloor();
    }

    if (box.type === 'anchor') {
      this._triggerAnchorCascade(box);
      this._scheduleQuake('упал якорный ящик');
    }

    if (cause === 'provoked') {
      this._scheduleQuake('вы сами сдёрнули ящик с потолка');
    }

    const hitPlayer = affectedTiles.some((tile) => tile.x === this.player.x && tile.y === this.player.y);
    if (hitPlayer) {
      this._lose('box', box);
      return;
    }

    this._markUiDirty();
  }

  _sendMonsterToFloor(triggeredByPlayer) {
    const now = performance.now();
    this.monster.state = 'stunned';
    this.monster.stateUntil = now + MONSTER_STUN_MS;
    this.monster.dropChargeSince = 0;
    this.monster.hiddenUntil = 0;
    this.monster.nextMoveAt = now + MONSTER_STUN_MS;
    this.audio.playMonsterDrop();

    if (triggeredByPlayer) {
      this._showMessage('Монстр рухнул на пол и на миг оглушён.', 1500);
    }
  }

  _triggerAnchorCascade(box) {
    const neighbors = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) {
          continue;
        }
        const other = this._getLiveBox(box.x + dx, box.y + dy);
        if (other) {
          neighbors.push(other);
        }
      }
    }

    shuffleArray(neighbors).slice(0, randomInt(2, Math.min(4, neighbors.length))).forEach((other) => {
      other.stability -= other.maxStability * 0.7;
      if (other.stability <= 0) {
        this._dropBox(other, 'anchor');
      }
    });
  }

  _grantSafeReward() {
    this.lookFreezeBudgetMs = Math.min(LOOK_FREEZE_MAX_MS, this.lookFreezeBudgetMs + 4000);
    Object.keys(this.slotCooldowns).forEach((slotId) => {
      this.slotCooldowns[slotId] = Math.max(performance.now(), this.slotCooldowns[slotId] - 6000);
    });
    this._showMessage('Сейф треснул: +4 секунды взгляда и кулдауны стали короче.', 1900);
  }

  _getDebrisTilesForBox(box) {
    if (!BOX_TYPES[box.type].blocks) {
      return [];
    }

    if (box.type !== 'heavy') {
      return [{ x: box.x, y: box.y }];
    }

    const tiles = [{ x: box.x, y: box.y }];
    if (box.orientation === 'horizontal') {
      tiles.push({ x: box.x - 1, y: box.y }, { x: box.x + 1, y: box.y });
    } else {
      tiles.push({ x: box.x, y: box.y - 1 }, { x: box.x, y: box.y + 1 });
    }
    return tiles.filter((tile) => this._isActiveTile(tile.x, tile.y));
  }

  _isActiveTile(x, y) {
    return this.floorData.activeTileKeys.has(tileKey(x, y));
  }

  _isBlocked(x, y) {
    return Boolean(this.floorData.debrisMap[tileKey(x, y)]);
  }

  _getLiveBox(x, y) {
    const box = this.floorData.boxes[tileKey(x, y)];
    return box && !box.fallen ? box : null;
  }

  setLookMode(mode) {
    if (this.state === 'loading' || this.state === 'won' || this.state === 'lost') {
      return;
    }

    this.player.lookMode = mode;
    this._markUiDirty();
  }

  toggleLookMode() {
    this.setLookMode(this.player.lookMode === 'up' ? 'down' : 'up');
  }

  rotateView(direction) {
    if (this.state === 'loading' || this.state === 'won' || this.state === 'lost') {
      return;
    }

    this.player.facing = (this.player.facing + direction + 4) % 4;
    this.player.cameraYaw = this._facingToYaw(this.player.facing);
    this._markUiDirty();
  }

  adjustCameraYaw(deltaYaw) {
    if (this.state === 'loading' || this.state === 'won' || this.state === 'lost') {
      return;
    }

    const currentYaw = typeof this.player.cameraYaw === 'number'
      ? this.player.cameraYaw
      : this._facingToYaw(this.player.facing);
    this.player.cameraYaw = normalizeAngle(currentYaw + deltaYaw);
    this.player.facing = this._yawToFacing(this.player.cameraYaw);
    this._markUiDirty();
  }

  adjustCameraPitch(deltaPitch) {
    if (this.state === 'loading' || this.state === 'won' || this.state === 'lost') {
      return;
    }

    const currentPitch = typeof this.player.cameraPitch === 'number' ? this.player.cameraPitch : 0;
    this.player.cameraPitch = clamp(currentPitch + deltaPitch, -0.95, 0.82);
    this._markUiDirty();
  }

  selectTopic(slotId) {
    if (this.state !== 'topic_select') {
      return;
    }

    const cooldownRemaining = this._getSlotCooldownRemaining(slotId, performance.now());
    if (cooldownRemaining > 0) {
      this._showMessage(`Слот ещё перезаряжается: ${Math.ceil(cooldownRemaining / 1000)} c.`, 1300);
      return;
    }

    const question = this.questionManager.getQuestion(slotId);
    if (!question) {
      this._showMessage('Вопрос не удалось получить.', 1200);
      return;
    }

    this.currentSlotId = slotId;
    this.currentQuestion = question;
    this.questionPanelYaw = this._facingToYaw(this._yawToFacing(this.player.cameraYaw ?? this._facingToYaw(this.player.facing)));
    this.state = 'question';
    this._showQuestion(question);
    this._markUiDirty();
  }

  answerQuestion(selectedIndex) {
    if (this.state !== 'question' || !this.currentQuestion || this.questionAnsweredIndex !== null) {
      return;
    }

    const slotConfig = this.slotConfigs.find((slot) => slot.slotDef.id === this.currentSlotId);
    if (!slotConfig) {
      return;
    }

    const question = this.currentQuestion;
    const isCorrect = selectedIndex === question.options.correctIndex;
    this.questionsAnswered += 1;
    this.questionAnsweredIndex = selectedIndex;

    if (isCorrect) {
      this.questionsCorrect += 1;
      this.audio.playCorrectAnswer();
      this.questionManager.onCorrectAnswer(this.currentSlotId);
      this._showFeedback(true, this._applyBonus(slotConfig));
      return;
    }

    this.audio.playWrongAnswer();
    this.questionManager.onWrongAnswer(this.currentSlotId);

    if (slotConfig.slotDef.wrongCooldownMs) {
      this.slotCooldowns[this.currentSlotId] = performance.now() + slotConfig.slotDef.wrongCooldownMs;
    }

    const correctAnswer = question.options.options[question.options.correctIndex];
    this._showFeedback(false, `Неверно. Правильный ответ: ${correctAnswer}`);
    this._clearTransitionTimeout();
    this.transitionTimeoutId = window.setTimeout(() => {
      if (this.state === 'lost' || this.state === 'won') {
        return;
      }
      this.state = 'topic_select';
      this._showTopicPanel();
      this._markUiDirty();
    }, 1100);
  }

  _answerQuestionFromView() {
    if (this.state !== 'question' || !this.renderer) {
      return;
    }

    const selectedIndex = this.renderer.pickQuestionOption();
    if (selectedIndex === null) {
      return;
    }

    this.answerQuestion(selectedIndex);
  }

  _applyBonus(slotConfig) {
    const slot = slotConfig.slotDef;
    const now = performance.now();

    if (slot.bonus === 'move2') {
      this.movesLeft = 2;
      this._clearTransitionTimeout();
      this.transitionTimeoutId = window.setTimeout(() => {
        if (this.state === 'lost' || this.state === 'won') {
          return;
        }
        this.state = 'action_select';
        this._showActionPanel();
        this._markUiDirty();
      }, 620);
      return 'Верно. У вас есть 2 действия на полу.';
    }

    if (slot.bonus === 'vision') {
      this.state = 'target_select';
      this.targetMode = 'vision';
      this.targetSourceSlotId = slot.id;
      this._showTargetPanel('Выберите центр области 3x3. Там вы увидите цветовую устойчивость ящиков на 10 секунд.');
      return 'Верно. Выберите зону для расширенного зрения.';
    }

    if (slot.bonus === 'fortify') {
      this.state = 'target_select';
      this.targetMode = 'fortify';
      this.targetSourceSlotId = slot.id;
      this._showTargetPanel('Выберите область 3x3. До шести ящиков в ней станут неуязвимыми на 30 секунд.');
      return 'Верно. Выберите зону для укрепления.';
    }

    if (slot.bonus === 'stealth') {
      this.monster.hiddenUntil = now + STEALTH_DURATION_MS;
      this.slotCooldowns[slot.id] = now + slot.successCooldownMs;
      this.audio.playStealth();
      this._clearTransitionTimeout();
      this.transitionTimeoutId = window.setTimeout(() => {
        if (this.state === 'lost' || this.state === 'won') {
          return;
        }
        this.state = 'topic_select';
        this._showTopicPanel();
        this._markUiDirty();
      }, 620);
      return 'Верно. Монстр потерял вас на 6 секунд.';
    }

    if (slot.bonus === 'cleanup') {
      const options = this._getCleanupTargets();
      if (!options.length) {
        this._clearTransitionTimeout();
        this.transitionTimeoutId = window.setTimeout(() => {
          if (this.state === 'lost' || this.state === 'won') {
            return;
          }
          this.state = 'topic_select';
          this._showTopicPanel();
          this._markUiDirty();
        }, 620);
        return 'Верно, но рядом нет завала для расчистки.';
      }

      this.state = 'target_select';
      this.targetMode = 'cleanup';
      this.targetSourceSlotId = slot.id;
      this._showTargetPanel('Выберите один завал на соседней клетке.');
      return 'Верно. Выберите соседний завал.';
    }

    return 'Верно.';
  }

  movePlayer(relativeDirection) {
    if (this.state !== 'action_select' || this.movesLeft <= 0 || !this.renderer) {
      return;
    }

    const delta = this.renderer.getMoveDelta(relativeDirection, this.player.facing);
    const nextX = this.player.x + delta.x;
    const nextY = this.player.y + delta.y;

    if (!this._isActiveTile(nextX, nextY)) {
      this._showMessage('Там пустота Башни.', 900);
      return;
    }

    if (this._isBlocked(nextX, nextY)) {
      this._showMessage('Путь завален упавшим ящиком.', 1000);
      return;
    }

    this.player.x = nextX;
    this.player.y = nextY;
    this.movesLeft -= 1;
    this.floorData.lastPlayerMoveAt = performance.now();
    this.audio.playStep();

    if (this.monster.state === 'floor' && this.monster.x === this.player.x && this.monster.y === this.player.y) {
      this.audio.playMonsterGrab();
      this._lose('monster');
      return;
    }

    if (this.movesLeft > 0) {
      this._showActionPanel();
    } else {
      this.state = 'topic_select';
      this._showTopicPanel();
    }

    this._markUiDirty();
  }

  tryUseHatch() {
    if (this.state !== 'action_select' || this.movesLeft <= 0) {
      return;
    }

    const hatch = this._getCurrentHatch();
    if (!hatch || hatch.opened) {
      return;
    }

    hatch.opened = true;
    this.movesLeft -= 1;
    this.runOpenedHatches += 1;
    this.floorData.lastPlayerMoveAt = performance.now();
    this.audio.playHatchOpen();
    this._showMessage('Люк открыт. Камень под ногами стал тоньше.', 1400);

    if (this._getOpenedHatchCount() >= 3) {
      this._completeFloor();
      return;
    }

    if (this.movesLeft > 0) {
      this._showActionPanel();
    } else {
      this.state = 'topic_select';
      this._showTopicPanel();
    }

    this._markUiDirty();
  }

  cancelTargeting() {
    if (this.state !== 'target_select') {
      return;
    }

    this.targetMode = null;
    this.targetSourceSlotId = null;
    this.state = 'topic_select';
    this._showTopicPanel();
    this._markUiDirty();
  }

  applyTargetSelection(x, y) {
    if (this.state !== 'target_select') {
      return;
    }

    if (this.targetMode === 'vision') {
      this._applyVisionTarget(x, y);
      return;
    }

    if (this.targetMode === 'fortify') {
      this._applyFortifyTarget(x, y);
      return;
    }

    if (this.targetMode === 'cleanup') {
      this._applyCleanupTarget(x, y);
    }
  }

  _applyVisionTarget(centerX, centerY) {
    const now = performance.now();
    this._getAreaTiles(centerX, centerY).forEach((tile) => {
      const box = this._getLiveBox(tile.x, tile.y);
      if (box) {
        box.revealUntil = now + REVEAL_DURATION_MS;
      }
    });

    this.slotCooldowns[this.targetSourceSlotId] = now + BONUS_SLOTS.find((slot) => slot.id === this.targetSourceSlotId).successCooldownMs;
    this.audio.playReveal();
    this.targetMode = null;
    this.targetSourceSlotId = null;
    this.state = 'topic_select';
    this._showTopicPanel();
    this._showMessage('Зона подсвечена. Смотрите на рамки ящиков на схеме.', 1800);
    this._markUiDirty();
  }

  _applyFortifyTarget(centerX, centerY) {
    const now = performance.now();
    const boxes = this._getAreaTiles(centerX, centerY)
      .map((tile) => this._getLiveBox(tile.x, tile.y))
      .filter(Boolean)
      .sort((left, right) => left.stability - right.stability)
      .slice(0, 6);

    boxes.forEach((box) => {
      box.fortifiedUntil = now + FORTIFY_DURATION_MS;
    });

    this.slotCooldowns[this.targetSourceSlotId] = now + BONUS_SLOTS.find((slot) => slot.id === this.targetSourceSlotId).successCooldownMs;
    this.audio.playFortify();
    this.targetMode = null;
    this.targetSourceSlotId = null;
    this.state = 'topic_select';
    this._showTopicPanel();
    this._showMessage('Ящики в выбранной зоне временно укреплены.', 1800);
    this._markUiDirty();
  }

  _applyCleanupTarget(x, y) {
    const key = tileKey(x, y);
    if (!this.floorData.debrisMap[key]) {
      this._showMessage('Эта клетка не завалена.', 900);
      return;
    }

    delete this.floorData.debrisMap[key];
    this.audio.playCleanup();
    this.targetMode = null;
    this.targetSourceSlotId = null;
    this.state = 'topic_select';
    this._showTopicPanel();
    this._showMessage('Проход рядом расчищен.', 1400);
    this._markUiDirty();
  }

  _getCleanupTargets() {
    return [
      { x: this.player.x + 1, y: this.player.y },
      { x: this.player.x - 1, y: this.player.y },
      { x: this.player.x, y: this.player.y + 1 },
      { x: this.player.x, y: this.player.y - 1 }
    ].filter((tile) => Boolean(this.floorData.debrisMap[tileKey(tile.x, tile.y)]));
  }

  _getAreaTiles(centerX, centerY) {
    const tiles = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = centerX + dx;
        const y = centerY + dy;
        if (this._isActiveTile(x, y)) {
          tiles.push({ x, y });
        }
      }
    }
    return tiles;
  }

  _getCurrentHatch() {
    return this.floorData.hatchMap[tileKey(this.player.x, this.player.y)] || null;
  }

  _getOpenedHatchCount() {
    return this.floorData.hatches.filter((hatch) => hatch.opened).length;
  }

  _completeFloor() {
    if (this.state === 'lost' || this.state === 'won') {
      return;
    }

    if (this.currentFloor >= FLOOR_CONFIGS.length) {
      this._win();
      return;
    }

    this.state = 'transition';
    this.audio.playCollapse();
    this.renderer.shake(0.18, 1200);
    this.ui.transitionBanner.textContent = 'Пол ломается. Вы падаете на следующий этаж...';
    this.ui.transitionBanner.classList.remove('hidden');
    this._hidePanels();

    this.floorTransitionTimeoutId = window.setTimeout(() => {
      this.ui.transitionBanner.classList.add('hidden');
      this.init(this._buildSettings(this.currentFloor + 1), true, true).catch((error) => {
        console.error('Failed to continue the run:', error);
      });
    }, FLOOR_TRANSITION_MS);
  }

  _win() {
    this.state = 'won';
    this._clearAllTimeouts();
    this._hidePanels();
    this._saveScore(true);
    this.ui.winStats.textContent =
      `Вы прошли все 5 этажей. Точность: ${this._getAccuracy()}%. Правильных ответов: ${this.questionsCorrect}/${this.questionsAnswered}. Открыто люков: ${this.runOpenedHatches}/15.`;

    window.setTimeout(() => {
      if (this.renderer) {
        this.renderer.stopLoop();
      }
      this._setActiveScreen('win-screen');
    }, 500);
  }

  _lose(reason, box = null) {
    if (this.state === 'lost' || this.state === 'won') {
      return;
    }

    this.state = 'lost';
    this._clearAllTimeouts();
    this._hidePanels();
    this.ui.deathOverlay.classList.add('active');
    this._saveScore(false);

    if (reason === 'box' && box) {
      this.deathInfo = {
        title: 'НЕ УГЛЯДЕЛИ СВЕРХУ',
        message: `Сверху сорвался ${BOX_TYPES[box.type].label.toLowerCase()} ящик. Вы стояли на клетке ${box.x + 1}:${box.y + 1}.`
      };
    } else {
      this.deathInfo = {
        title: 'ОН ДОГНАЛ ВАС',
        message: `Монстр схватил вас на полу. Его позиция: ${this.monster.x + 1}:${this.monster.y + 1}.`
      };
    }

    this.ui.loseTitle.textContent = this.deathInfo.title;
    this.ui.loseMessage.textContent = `${this.deathInfo.message} Открыто люков: ${this._getOpenedHatchCount()}/3 на текущем этаже.`;
    this.ui.loseStats.textContent =
      `Этаж: ${this.currentFloor}. Точность: ${this._getAccuracy()}%. Правильных ответов: ${this.questionsCorrect}/${this.questionsAnswered}.`;

    window.setTimeout(() => {
      if (this.renderer) {
        this.renderer.stopLoop();
      }
      this._setActiveScreen('lose-screen');
    }, 520);
  }

  _saveScore(won) {
    this.leaderboard.addScore({
      name: this.playerName,
      runName: this.runName,
      levelReached: won ? FLOOR_CONFIGS.length : this.currentFloor,
      accuracy: this._getAccuracy(),
      correct: this.questionsCorrect,
      total: this.questionsAnswered,
      openedHatches: this.runOpenedHatches,
      durationMs: Math.round(performance.now() - this.runStartedAt),
      lexicalTopic: this.lexicalTopic,
      won,
      date: new Date().toISOString()
    });
  }

  _getAccuracy() {
    if (!this.questionsAnswered) {
      return 0;
    }
    return Math.round((this.questionsCorrect / this.questionsAnswered) * 100);
  }

  restartLevel() {
    this.init(this._buildSettings(this.currentFloor), true, false).catch((error) => {
      console.error('Failed to restart level:', error);
    });
  }

  restartRun() {
    this.currentFloor = 1;
    this.runStartedAt = 0;
  }

  _buildSettings(level) {
    return {
      playerName: this.playerName,
      runName: this.runName,
      langLevel: this.langLevel,
      lexicalTopic: this.lexicalTopic,
      slotConfigs: this.slotConfigs,
      level
    };
  }

  _showTopicPanel() {
    this._hidePanels();
    this.ui.topicPanel.classList.remove('hidden');
    this.ui.topicButtons.innerHTML = '';

    this.slotConfigs.forEach((config, index) => {
      const button = document.createElement('button');
      const cooldown = this._getSlotCooldownRemaining(config.slotDef.id, performance.now());
      button.className = 'topic-btn';
      if (cooldown > 0) {
        button.classList.add('cooldown');
      }
      button.innerHTML = `
        <span class="topic-name">${index + 1}. ${this._escapeHtml(config.grammarTopic)}</span>
        <span class="topic-bonus">${this._escapeHtml(config.slotDef.bonusLabel)}</span>
        <span class="topic-cooldown">${cooldown > 0 ? `CD: ${Math.ceil(cooldown / 1000)} c` : 'Готово'}</span>
      `;
      button.addEventListener('click', () => this.selectTopic(config.slotDef.id));
      this.ui.topicButtons.appendChild(button);
    });
  }

  _showQuestion(question) {
    this._hidePanels();
    this.questionFeedback = null;
    this.questionAnsweredIndex = null;
    this._markUiDirty(true);
  }

  _showFeedback(isCorrect, text) {
    this.questionFeedback = { isCorrect, text };
    this._markUiDirty(true);
  }

  _showActionPanel() {
    this._hidePanels();
    this.ui.actionPanel.classList.remove('hidden');
    this.ui.actionPrompt.textContent = `Выберите направление. Действий осталось: ${this.movesLeft}.`;

    document.querySelectorAll('.dir-btn').forEach((button) => {
      const delta = this.renderer.getMoveDelta(button.dataset.dir, this.player.facing);
      const nextX = this.player.x + delta.x;
      const nextY = this.player.y + delta.y;
      button.disabled = !this._isActiveTile(nextX, nextY) || this._isBlocked(nextX, nextY);
    });
  }

  _showTargetPanel(prompt) {
    this._hidePanels();
    this.ui.targetPanel.classList.remove('hidden');
    this.ui.targetPrompt.textContent = prompt;
    this._renderTargetGrid();
  }

  _renderTargetGrid() {
    const config = this.floorData.config;
    this.ui.targetGrid.innerHTML = '';
    this.ui.targetGrid.style.gridTemplateColumns = `repeat(${config.width}, minmax(0, 1fr))`;

    const cleanupTargets = this.targetMode === 'cleanup'
      ? new Set(this._getCleanupTargets().map((tile) => tileKey(tile.x, tile.y)))
      : null;

    for (let y = 0; y < config.height; y += 1) {
      for (let x = 0; x < config.width; x += 1) {
        const button = document.createElement('button');
        button.className = 'board-tile';

        if (!this._isActiveTile(x, y)) {
          button.classList.add('inactive');
          button.disabled = true;
        } else {
          button.classList.add('floor', 'targetable');
          const key = tileKey(x, y);
          if (cleanupTargets && !cleanupTargets.has(key)) {
            button.disabled = true;
            button.classList.remove('targetable');
          } else {
            button.addEventListener('click', () => this.applyTargetSelection(x, y));
          }

          const hatch = this.floorData.hatchMap[key];
          if (hatch) {
            button.classList.add(hatch.opened ? 'hatch-open' : 'hatch');
          }
          if (this.floorData.debrisMap[key]) {
            button.classList.add('debris');
          }
        }

        this.ui.targetGrid.appendChild(button);
      }
    }
  }

  _hidePanels() {
    this.ui.topicPanel.classList.add('hidden');
    this.ui.actionPanel.classList.add('hidden');
    this.ui.targetPanel.classList.add('hidden');
  }

  _showLoading(text) {
    this.ui.loadingText.textContent = text;
    this.ui.loadingOverlay.classList.remove('hidden');
  }

  _hideLoading() {
    this.ui.loadingOverlay.classList.add('hidden');
  }

  _refreshUi(now) {
    this._updateHud(now);
    this._renderBoard(now);

    if (this.state === 'topic_select') {
      this._showTopicPanel();
    } else if (this.state === 'action_select') {
      this._showActionPanel();
    } else if (this.state === 'target_select') {
      this._renderTargetGrid();
    }
  }

  _updateHud(now) {
    this.ui.floorTitle.textContent = `${this.floorConfig.name} • ${this.floorConfig.subtitle}`;
    this.ui.floorMeta.textContent = `Этаж ${this.currentFloor} из ${FLOOR_CONFIGS.length}`;
    this.ui.runNameDisplay.textContent = this.runName;
    this.ui.lexicalTopicDisplay.textContent = `Тема: ${this.lexicalTopic}`;
    this.ui.monsterDisplay.textContent = this._describeMonster(now);
    this.ui.movesDisplay.textContent = `Действия: ${this.movesLeft}`;
    this.ui.hatchDisplay.textContent = `Люки: ${this._getOpenedHatchCount()}/3`;

    if (this.lookFreezeCooldownUntil > now) {
      this.ui.freezeLabel.textContent = 'Взгляд перезаряжается';
      this.ui.freezeMeter.textContent = `${formatSeconds(this.lookFreezeCooldownUntil - now)} c`;
    } else {
      this.ui.freezeLabel.textContent = 'Взгляд';
      this.ui.freezeMeter.textContent = `${formatSeconds(this.lookFreezeBudgetMs)} c`;
    }

    this.ui.quakeDisplay.classList.toggle('hidden', this.quake.phase === 'idle');
    if (this.quake.phase === 'warning') {
      this.ui.quakeDisplay.textContent = `Толчок через ${formatSeconds(this.quake.warnUntil - now)} c`;
    } else if (this.quake.phase === 'active') {
      this.ui.quakeDisplay.textContent = `Толчок идёт: ${formatSeconds(this.quake.activeUntil - now)} c`;
    }

    this.ui.lookUpButton.classList.toggle('active', this.player.lookMode === 'up');
    this.ui.lookDownButton.classList.toggle('active', this.player.lookMode === 'down');
    this.ui.useHatchButton.classList.toggle('hidden', !(this.state === 'action_select' && this._getCurrentHatch() && !this._getCurrentHatch().opened));

    this.ui.statusEffects.innerHTML = '';
    if (this.monster.hiddenUntil > now) {
      this.ui.statusEffects.appendChild(this._createStatusBadge(`Маскировка: ${formatSeconds(this.monster.hiddenUntil - now)} c`, 'success'));
    }
    if (Object.values(this.floorData.boxes).some((box) => box.revealUntil > now)) {
      this.ui.statusEffects.appendChild(this._createStatusBadge('Видны stability-рамки', 'warning'));
    }
    if (Object.values(this.floorData.boxes).some((box) => box.fortifiedUntil > now)) {
      this.ui.statusEffects.appendChild(this._createStatusBadge('Укрепление активно', 'success'));
    }
    if (this.monster.state === 'stunned') {
      this.ui.statusEffects.appendChild(this._createStatusBadge('Монстр оглушён', 'danger'));
    }
  }

  _describeMonster(now) {
    if (this.monster.state === 'ceiling') {
      if (this._isCeilingMonsterFrozen(now)) {
        return 'Der Fehler: застыл на потолке';
      }
      if (this.monster.hiddenUntil > now) {
        return 'Der Fehler: блуждает на потолке';
      }
      if (this.monster.x === this.player.x && this.monster.y === this.player.y) {
        return 'Der Fehler: завис прямо над вами';
      }
      return `Der Fehler: потолок ${this.monster.x + 1}:${this.monster.y + 1}`;
    }

    if (this.monster.state === 'stunned') {
      return `Der Fehler: оглушён ${formatSeconds(this.monster.stateUntil - now)} c`;
    }

    return `Der Fehler: пол ${this.monster.x + 1}:${this.monster.y + 1}`;
  }

  _renderBoard(now) {
    const config = this.floorConfig;
    const board = this.ui.boardPanel;
    board.innerHTML = '';
    board.style.gridTemplateColumns = `repeat(${config.width}, minmax(0, 1fr))`;
    this.ui.boardHeading.textContent = this.player.lookMode === 'up' ? 'Потолок' : 'Пол';

    for (let y = 0; y < config.height; y += 1) {
      for (let x = 0; x < config.width; x += 1) {
        const cell = document.createElement('div');
        cell.className = 'board-tile';

        if (!this._isActiveTile(x, y)) {
          cell.classList.add('inactive');
          board.appendChild(cell);
          continue;
        }

        const key = tileKey(x, y);
        const hatch = this.floorData.hatchMap[key];
        const box = this.floorData.boxes[key];
        const debris = this.floorData.debrisMap[key];
        cell.classList.add('floor');

        if (hatch) {
          cell.classList.add(hatch.opened ? 'hatch-open' : 'hatch');
        }
        if (debris) {
          cell.classList.add('debris');
        }

        if (box && !box.fallen && this.player.lookMode === 'up') {
          cell.classList.add('ceiling-box', `box-${box.type}`);
          const ratio = box.stability / box.maxStability;
          if (box.revealUntil > now) {
            cell.classList.add(ratio >= 0.55 ? 'reveal-safe' : ratio >= 0.28 ? 'reveal-mid' : 'reveal-risk');
          }
          if (box.fortifiedUntil > now) {
            cell.classList.add('fortified');
          }
        }

        if (this.monster.x === x && this.monster.y === y) {
          const onCeiling = this.monster.state === 'ceiling';
          if ((this.player.lookMode === 'up' && onCeiling) || (this.player.lookMode === 'down' && !onCeiling)) {
            cell.classList.add(onCeiling ? 'monster-ceiling' : 'monster-floor');
            const tag = document.createElement('span');
            tag.textContent = 'M';
            cell.appendChild(tag);
          }
        }

        if (this.player.x === x && this.player.y === y) {
          cell.classList.add('player');
          cell.dataset.label = this._getFacingArrow();
        } else if (hatch && !hatch.opened) {
          cell.dataset.label = 'Л';
        } else if (hatch && hatch.opened) {
          cell.dataset.label = 'О';
        } else if (debris) {
          cell.dataset.label = 'X';
        } else {
          cell.dataset.label = '';
        }

        board.appendChild(cell);
      }
    }

    this.ui.boardLegend.textContent = this.player.lookMode === 'up'
      ? 'Рамки ящиков показывают риск только после Расширенного зрения. Синий знак означает укрепление.'
      : 'Люк = цель. X = завал. Монстр на полу проходит сквозь завалы, а вы нет.';
  }

  _getFacingArrow() {
    return ['↑', '→', '↓', '←'][this.player.facing] || '↑';
  }

  _createStatusBadge(text, kind) {
    const badge = document.createElement('div');
    badge.className = `status-badge ${kind}`;
    badge.textContent = text;
    return badge;
  }

  _getSlotCooldownRemaining(slotId, now) {
    return Math.max(0, (this.slotCooldowns[slotId] || 0) - now);
  }

  _showMessage(text, durationMs = 1500) {
    this._clearMessageTimeout();
    this.ui.messageBanner.textContent = text;
    this.ui.messageBanner.classList.remove('hidden');
    this.messageTimeoutId = window.setTimeout(() => {
      this.ui.messageBanner.classList.add('hidden');
    }, durationMs);
  }

  _clearMessageTimeout() {
    if (this.messageTimeoutId) {
      window.clearTimeout(this.messageTimeoutId);
      this.messageTimeoutId = null;
    }
  }

  _clearTransitionTimeout() {
    if (this.transitionTimeoutId) {
      window.clearTimeout(this.transitionTimeoutId);
      this.transitionTimeoutId = null;
    }
  }

  _clearAllTimeouts() {
    this._clearMessageTimeout();
    this._clearTransitionTimeout();
    if (this.floorTransitionTimeoutId) {
      window.clearTimeout(this.floorTransitionTimeoutId);
      this.floorTransitionTimeoutId = null;
    }
  }

  _syncRenderer(now) {
    if (!this.renderer) {
      return;
    }

    this.renderer.setPlayerState(this.player);
    this.renderer.sync({
      now,
      state: this.state,
      floorData: this.floorData,
      player: this.player,
      monster: this.monster,
      quake: this.quake,
      question: this.currentQuestion
        ? {
            active: this.state === 'question',
            topic: this.currentQuestion.grammarTopic,
            level: this.currentQuestion.level,
            text: this.currentQuestion.text,
            display: this.currentQuestion.display,
            options: this.currentQuestion.options.options,
            correctIndex: this.currentQuestion.options.correctIndex,
            selectedIndex: this.questionAnsweredIndex,
            feedback: this.questionFeedback,
            panelYaw: this.questionPanelYaw
          }
        : null
    });
    this.audio.setThreatLevel(this._calculateThreatLevel(now));
  }

  _calculateThreatLevel(now) {
    const hatchPressure = this._getOpenedHatchCount() / 3;
    const distance = manhattan(this.player, this.monster);
    const proximity = clamp(1 - distance / 8, 0, 1);
    const floorPressure = this.monster.state === 'floor' ? 0.35 : 0;
    const quakePressure = this.quake.phase === 'warning' ? 0.22 : this.quake.phase === 'active' ? 0.4 : 0;
    const lookPressure = this.player.lookMode === 'down' ? 0.12 : 0;
    return clamp(hatchPressure * 0.18 + proximity * 0.5 + floorPressure + quakePressure + lookPressure, 0, 1);
  }

  _facingToYaw(facing) {
    return [0, -Math.PI / 2, Math.PI, Math.PI / 2][facing] || 0;
  }

  _yawToFacing(yaw) {
    return ((Math.round(-normalizeAngle(yaw) / (Math.PI / 2)) % 4) + 4) % 4;
  }

  _markUiDirty(force = false) {
    this.uiDirty = true;
    if (force) {
      this.nextUiRefreshAt = 0;
    }
  }

  _setActiveScreen(screenId) {
    SCREEN_IDS.forEach((id) => {
      const node = document.getElementById(id);
      node.classList.toggle('active', id === screenId);
    });
  }

  destroy() {
    this._clearAllTimeouts();
    this._disposeRuntime();
    this._hidePanels();
    this._hideLoading();
    this.ui.transitionBanner.classList.add('hidden');
    this.ui.messageBanner.classList.add('hidden');
    this.ui.deathOverlay.classList.remove('active');
    this.state = 'menu';
  }

  _disposeRuntime() {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    if (this.audio) {
      this.audio.dispose();
      this.audio = null;
    }
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
