const PLAYER_NAME_KEY = 'turm_player_name';
const RUN_NAME_KEY = 'turm_run_name';
const TUTORIAL_SEEN_KEY = 'turm_tutorial_seen';
const LANG_LEVEL_KEY = 'turm_lang_level';

const game = new Game();

function safeStorageGet(key, fallback = '') {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (error) {
    console.warn(`Storage read failed for ${key}:`, error);
    return fallback;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Storage write failed for ${key}:`, error);
    return false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const ui = {
    menuScreen: document.getElementById('menu-screen'),
    leaderboardScreen: document.getElementById('leaderboard-screen'),
    gameScreen: document.getElementById('game-screen'),
    winScreen: document.getElementById('win-screen'),
    loseScreen: document.getElementById('lose-screen'),
    playerName: document.getElementById('player-name'),
    runName: document.getElementById('run-name'),
    lexicalGrid: document.getElementById('lexical-grid'),
    grammarPicker: document.getElementById('grammar-picker'),
    bonusSlots: Array.from(document.querySelectorAll('.bonus-slot')),
    tutorialOverlay: document.getElementById('tutorial-overlay'),
    tutorialClose: document.getElementById('tutorial-close'),
    levelButtons: Array.from(document.querySelectorAll('.level-btn')),
    startButton: document.getElementById('start-btn')
  };

  let selectedLexical = null;
  let selectedGrammar = null;
  let selectedSlotIndex = null;
  let selectedLevel = safeStorageGet(LANG_LEVEL_KEY, DEFAULT_CEFR_LEVEL) || DEFAULT_CEFR_LEVEL;
  const slotAssignments = Array(BONUS_SLOTS.length).fill(null);
  let pendingTutorialCallback = null;

  ui.playerName.value = safeStorageGet(PLAYER_NAME_KEY, '');
  ui.runName.value = safeStorageGet(RUN_NAME_KEY, '');

  renderLexicalGrid();
  renderSlots();
  renderGrammarPicker();
  renderLevelButtons();
  updateStartButton();
  showStep(1);

  document.getElementById('to-step2-btn').addEventListener('click', () => {
    showStep(2);
  });

  document.getElementById('to-step3-btn').addEventListener('click', () => {
    showStep(3);
  });

  document.getElementById('back-to-step1').addEventListener('click', () => showStep(1));
  document.getElementById('back-to-step2').addEventListener('click', () => showStep(2));
  document.getElementById('back-to-step3').addEventListener('click', () => showStep(3));

  ui.playerName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      showStep(2);
    }
  });

  ui.runName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      showStep(3);
    }
  });

  ui.levelButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectedLevel = button.dataset.level || DEFAULT_CEFR_LEVEL;
      renderLevelButtons();
    });
  });

  ui.bonusSlots.forEach((slotElement, index) => {
    slotElement.addEventListener('click', () => {
      if (selectedGrammar) {
        assignGrammarToSlot(index, selectedGrammar);
        return;
      }

      if (selectedSlotIndex === index) {
        slotAssignments[index] = null;
        selectedSlotIndex = null;
      } else {
        selectedSlotIndex = index;
      }

      renderSlots();
      renderGrammarPicker();
      updateStartButton();
    });
  });

  document.getElementById('start-btn').addEventListener('click', () => {
    const settings = buildGameSettings();
    if (!settings) {
      return;
    }

    if (!safeStorageGet(TUTORIAL_SEEN_KEY, '')) {
      safeStorageSet(TUTORIAL_SEEN_KEY, '1');
      showTutorial(() => startGame(settings));
      return;
    }

    startGame(settings);
  });

  ui.tutorialClose.addEventListener('click', () => {
    ui.tutorialOverlay.classList.add('hidden');
    if (pendingTutorialCallback) {
      const callback = pendingTutorialCallback;
      pendingTutorialCallback = null;
      callback();
    }
  });

  document.getElementById('leaderboard-btn').addEventListener('click', () => {
    game.leaderboard.render();
    setActiveScreen('leaderboard-screen');
  });

  document.getElementById('leaderboard-back').addEventListener('click', () => {
    setActiveScreen('menu-screen');
  });

  document.getElementById('win-restart').addEventListener('click', () => {
    game.destroy();
    game.restartRun();
    setActiveScreen('menu-screen');
    showStep(1);
  });

  document.getElementById('win-menu').addEventListener('click', () => {
    game.destroy();
    game.restartRun();
    setActiveScreen('menu-screen');
    showStep(1);
  });

  document.getElementById('lose-restart').addEventListener('click', () => {
    setActiveScreen('game-screen');
    game.restartLevel();
  });

  document.getElementById('lose-menu').addEventListener('click', () => {
    game.destroy();
    game.restartRun();
    setActiveScreen('menu-screen');
    showStep(1);
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      return;
    }

    if (!ui.tutorialOverlay.classList.contains('hidden') && (event.key === 'Enter' || event.key === 'Escape')) {
      event.preventDefault();
      ui.tutorialClose.click();
      return;
    }

    if (!ui.gameScreen.classList.contains('active')) {
      return;
    }

    if (event.key === 'Escape' && game.state === 'target_select') {
      event.preventDefault();
      game.cancelTargeting();
      return;
    }

    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      game.toggleLookMode();
      return;
    }

    if (event.key === 'q' || event.key === 'Q') {
      event.preventDefault();
      game.rotateView(-1);
      return;
    }

    if (event.key === 'e' || event.key === 'E') {
      event.preventDefault();
      game.rotateView(1);
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      game.tryUseHatch();
      return;
    }

    if (game.state === 'question') {
      return;
    }

    if (game.state === 'topic_select') {
      const topicIndex = parseInt(event.key, 10) - 1;
      if (topicIndex >= 0 && topicIndex < game.slotConfigs.length) {
        event.preventDefault();
        game.selectTopic(game.slotConfigs[topicIndex].slotDef.id);
      }
      return;
    }

    if (game.state === 'action_select') {
      const moveKeyMap = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        w: 'up',
        W: 'up',
        a: 'left',
        A: 'left',
        s: 'down',
        S: 'down',
        d: 'right',
        D: 'right'
      };

      if (moveKeyMap[event.key]) {
        event.preventDefault();
        game.movePlayer(moveKeyMap[event.key]);
        return;
      }

      if (event.key === 'x' || event.key === 'X') {
        event.preventDefault();
        game.skipExtraMove();
      }
    }
  });

  function showStep(stepNumber) {
    for (let index = 1; index <= 4; index += 1) {
      const node = document.getElementById(`setup-step${index}`);
      node.classList.toggle('hidden', index !== stepNumber);
    }
  }

  function setActiveScreen(screenId) {
    ['menu-screen', 'game-screen', 'win-screen', 'lose-screen', 'leaderboard-screen'].forEach((id) => {
      const node = document.getElementById(id);
      node.classList.toggle('active', id === screenId);
    });
  }

  function renderLexicalGrid() {
    ui.lexicalGrid.innerHTML = '';

    LEXICAL_TOPICS.forEach((topic) => {
      const button = document.createElement('button');
      button.className = 'lexical-btn';
      button.textContent = topic;
      button.classList.toggle('selected', selectedLexical === topic);
      button.addEventListener('click', () => {
        selectedLexical = topic;
        renderLexicalGrid();
        updateStartButton();
        showStep(4);
      });
      ui.lexicalGrid.appendChild(button);
    });
  }

  function renderSlots() {
    ui.bonusSlots.forEach((slotElement, index) => {
      const slot = BONUS_SLOTS[index];
      const grammar = slotAssignments[index];

      slotElement.querySelector('.slot-bonus').textContent = slot.bonusLabel;
      slotElement.querySelector('.slot-topic').textContent = grammar || 'Пусто';
      slotElement.querySelector('.slot-grammar').textContent = slot.helpOverride || slot.help;
      slotElement.classList.toggle('selected-slot', selectedSlotIndex === index);
      slotElement.classList.toggle('has-topic', Boolean(grammar));
      slotElement.classList.toggle('empty', !grammar);
    });
  }

  function renderLevelButtons() {
    ui.levelButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.level === selectedLevel);
    });
  }

  function renderGrammarPicker() {
    ui.grammarPicker.innerHTML = '';
    const usedTopics = slotAssignments.filter(Boolean);

    GRAMMAR_TOPICS.forEach((topic) => {
      const button = document.createElement('button');
      button.className = 'grammar-tag';
      button.textContent = topic;

      if (usedTopics.includes(topic)) {
        button.classList.add('used');
      }

      if (selectedGrammar === topic) {
        button.classList.add('selected-grammar');
      }

      button.addEventListener('click', () => {
        if (usedTopics.includes(topic)) {
          return;
        }

        if (selectedSlotIndex !== null) {
          assignGrammarToSlot(selectedSlotIndex, topic);
          return;
        }

        selectedGrammar = selectedGrammar === topic ? null : topic;
        renderSlots();
        renderGrammarPicker();
      });

      ui.grammarPicker.appendChild(button);
    });
  }

  function assignGrammarToSlot(slotIndex, grammarTopic) {
    for (let index = 0; index < slotAssignments.length; index += 1) {
      if (slotAssignments[index] === grammarTopic) {
        slotAssignments[index] = null;
      }
    }

    slotAssignments[slotIndex] = grammarTopic;
    selectedGrammar = null;
    selectedSlotIndex = null;
    renderSlots();
    renderGrammarPicker();
    updateStartButton();
  }

  function updateStartButton() {
    ui.startButton.disabled = !selectedLexical || slotAssignments.some((topic) => !topic);
  }

  function buildGameSettings() {
    if (!selectedLexical || slotAssignments.some((topic) => !topic)) {
      return null;
    }

    const playerName = ui.playerName.value.trim() || 'Spieler';
    const runName = ui.runName.value.trim() || 'Безымянный спуск';

    safeStorageSet(PLAYER_NAME_KEY, playerName);
    safeStorageSet(RUN_NAME_KEY, runName);
    safeStorageSet(LANG_LEVEL_KEY, selectedLevel);

    return {
      playerName,
      runName,
      langLevel: selectedLevel,
      lexicalTopic: selectedLexical,
      level: 1,
      slotConfigs: BONUS_SLOTS.map((slotDef, index) => ({
        slotDef,
        grammarTopic: slotAssignments[index]
      }))
    };
  }

  function startGame(settings) {
    setActiveScreen('game-screen');
    game.init(settings).catch((error) => {
      console.error('Failed to start the game:', error);
      game.destroy();
      setActiveScreen('menu-screen');
    });
  }

  function showTutorial(onClose) {
    pendingTutorialCallback = onClose;
    ui.tutorialOverlay.classList.remove('hidden');
  }
});
