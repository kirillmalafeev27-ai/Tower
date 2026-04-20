const DEFAULT_CEFR_LEVEL = 'A2';
const QUESTIONS_PER_TOPIC = 10;

const GRAMMAR_TOPICS = [
  'Praesens',
  'Perfekt',
  'Praeteritum',
  'Futur I',
  'Imperativ',
  'Modalverben',
  'Trennbare Verben',
  'Untrennbare Verben',
  'Reflexive Verben',
  'Verben mit Praepositionen',
  'Lassen',
  'Werden',
  'Sein vs. haben',
  'Nominativ',
  'Akkusativ',
  'Dativ',
  'Genitiv',
  'Artikel',
  'Possessivartikel',
  'Pronomen',
  'Personalpronomen',
  'Relativpronomen',
  'Fragewoerter',
  'Negation',
  'Adjektivdeklination',
  'Komparativ und Superlativ',
  'Steigerung',
  'Zahlen und Datum',
  'Temporale Praepositionen',
  'Lokale Praepositionen',
  'Wechselpraepositionen',
  'Praepositionen mit Dativ',
  'Praepositionen mit Akkusativ',
  'Satzklammer',
  'Wortstellung',
  'Wortstellung im Hauptsatz',
  'Wortstellung im Nebensatz',
  'weil-Saetze',
  'dass-Saetze',
  'wenn-Saetze',
  'obwohl-Saetze',
  'damit-Saetze',
  'Relativsaetze',
  'Indirekte Fragen',
  'Infinitiv mit zu',
  'Konjunktiv II',
  'Passiv',
  'Plusquamperfekt',
  'Doppelkonjunktionen',
  'als vs. wenn',
  'Partizip I und II',
  'Genitivpraepositionen'
];

const LEXICAL_TOPICS = [
  'Familie',
  'Freundschaft',
  'Wohnen',
  'Hausarbeit',
  'Schule',
  'Universitaet',
  'Arbeit',
  'Bewerbung',
  'Reisen',
  'Hotel',
  'Stadt',
  'Auf dem Land',
  'Essen und Trinken',
  'Restaurant',
  'Einkaufen',
  'Kleidung',
  'Gesundheit',
  'Koerper',
  'Sport',
  'Freizeit',
  'Musik',
  'Filme und Serien',
  'Natur',
  'Umwelt',
  'Verkehr',
  'Technik',
  'Internet',
  'Buecher',
  'Wetter',
  'Feiertage'
];

const BONUS_SLOTS = [
  {
    id: 'move',
    bonus: 'move2',
    bonusLabel: '+2 хода',
    successCooldownMs: 0,
    wrongCooldownMs: 0,
    help: 'Главный слот движения. Правильный ответ даёт 2 действия.'
  },
  {
    id: 'vision',
    bonus: 'vision',
    bonusLabel: 'Расш. зрение',
    successCooldownMs: 90000,
    wrongCooldownMs: 5000,
    help: 'Показывает устойчивость ящиков в выбранной зоне 3x3.'
  },
  {
    id: 'fortify',
    bonus: 'fortify',
    bonusLabel: 'Укрепление',
    successCooldownMs: 90000,
    wrongCooldownMs: 5000,
    help: 'Делает до 6 ящиков в выбранной зоне неуязвимыми на 30 секунд.'
  },
  {
    id: 'stealth',
    bonus: 'stealth',
    bonusLabel: 'Маскировка',
    successCooldownMs: 30000,
    wrongCooldownMs: 0,
    help: 'Монстр теряет игрока на 6 секунд и блуждает.'
  },
  {
    id: 'cleanup',
    bonus: 'cleanup',
    bonusLabel: 'Расчистка',
    successCooldownMs: 0,
    wrongCooldownMs: 0,
    help: 'Убирает один завал на соседней клетке.'
  }
];

function shuffleArray(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

class QuestionManager {
  constructor(level = DEFAULT_CEFR_LEVEL) {
    this.level = level;
    this.lexicalTopic = null;
    this.questionPool = Object.create(null);
    this.fetching = Object.create(null);
    this.slots = [];
    this.lastQuestion = null;
    this.usedDisplays = Object.create(null);
  }

  setLevel(level) {
    if (this.level !== level) {
      this.level = level;
      this.questionPool = Object.create(null);
      this.fetching = Object.create(null);
      this.usedDisplays = Object.create(null);
      this.lastQuestion = null;
    }
  }

  setLexicalTopic(topic) {
    if (this.lexicalTopic !== topic) {
      this.lexicalTopic = topic;
      this.questionPool = Object.create(null);
      this.fetching = Object.create(null);
      this.usedDisplays = Object.create(null);
      this.lastQuestion = null;
    }
  }

  configureSlots(slotConfigs) {
    this.slots = slotConfigs.filter(Boolean);
  }

  async prefetchAll() {
    const tasks = this.slots.map((slot) => this._ensurePool(slot.slotDef.id));
    await Promise.allSettled(tasks);
  }

  getQuestion(slotId) {
    const slotConfig = this.slots.find((slot) => slot.slotDef.id === slotId);
    if (!slotConfig) {
      return null;
    }

    const pool = this.questionPool[slotId];
    if (!pool || pool.length === 0) {
      return this._fallbackQuestion(slotConfig);
    }

    const rawQuestion = pool.shift();
    this.lastQuestion = { slotId, question: rawQuestion };

    if (pool.length === 0) {
      this._ensurePool(slotId);
    }

    return this._formatQuestion(rawQuestion, slotConfig);
  }

  onCorrectAnswer(slotId) {
    if (this.lastQuestion && this.lastQuestion.slotId === slotId) {
      const used = this.usedDisplays[slotId] || new Set();
      used.add(this.lastQuestion.question.display);
      this.usedDisplays[slotId] = used;
      this.lastQuestion = null;
    }

    if (!this.questionPool[slotId] || this.questionPool[slotId].length === 0) {
      this._ensurePool(slotId);
    }
  }

  onWrongAnswer(slotId) {
    if (!this.lastQuestion || this.lastQuestion.slotId !== slotId) {
      return;
    }

    const pool = this.questionPool[slotId] || [];
    const position = Math.floor(Math.random() * (pool.length + 1));
    pool.splice(position, 0, this.lastQuestion.question);
    this.questionPool[slotId] = pool;
    this.lastQuestion = null;
  }

  async _ensurePool(slotId) {
    if (this.fetching[slotId]) {
      return this.fetching[slotId];
    }

    if (this.questionPool[slotId] && this.questionPool[slotId].length > 0) {
      return this.questionPool[slotId];
    }

    const slotConfig = this.slots.find((slot) => slot.slotDef.id === slotId);
    if (!slotConfig) {
      return [];
    }

    this.fetching[slotId] = this._fetchQuestions(slotConfig)
      .catch((error) => {
        console.warn(`Не удалось загрузить вопросы для слота ${slotId}:`, error);
        return [];
      })
      .finally(() => {
        delete this.fetching[slotId];
      });

    return this.fetching[slotId];
  }

  async _fetchQuestions(slotConfig) {
    const slotId = slotConfig.slotDef.id;
    const seen = Array.from(this.usedDisplays[slotId] || []).slice(-12);
    const grammarTopic = slotConfig.grammarTopic;
    const isWortstellung = /wortstellung/i.test(grammarTopic);

    const response = await fetch('/api/generate-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: this.level,
        lexicalTopic: this.lexicalTopic,
        grammarTopic,
        isWortstellung,
        count: QUESTIONS_PER_TOPIC,
        exclude: seen
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const valid = (data.questions || []).filter((question) => this._isValidQuestion(question));
    if (!valid.length) {
      return [];
    }

    const pool = [...(this.questionPool[slotId] || []), ...shuffleArray(valid)];
    this.questionPool[slotId] = pool;
    return pool;
  }

  _isValidQuestion(question) {
    return Boolean(
      question &&
        typeof question.text === 'string' &&
        typeof question.display === 'string' &&
        Array.isArray(question.options) &&
        question.options.length === 4 &&
        typeof question.correct === 'number' &&
        question.correct >= 0 &&
        question.correct <= 3
    );
  }

  _formatQuestion(rawQuestion, slotConfig) {
    const correctAnswer = rawQuestion.options[rawQuestion.correct];
    const shuffledOptions = shuffleArray(rawQuestion.options);

    return {
      slotId: slotConfig.slotDef.id,
      slotDef: slotConfig.slotDef,
      grammarTopic: slotConfig.grammarTopic,
      level: this.level,
      text: rawQuestion.text,
      display: rawQuestion.display,
      options: {
        options: shuffledOptions,
        correctIndex: shuffledOptions.indexOf(correctAnswer)
      }
    };
  }

  _fallbackQuestion(slotConfig) {
    return {
      slotId: slotConfig.slotDef.id,
      slotDef: slotConfig.slotDef,
      grammarTopic: slotConfig.grammarTopic,
      level: this.level,
      text: 'Резервное упражнение',
      display: 'Сервер вопросов недоступен. Нажмите OK, чтобы не останавливать забег.',
      options: {
        options: ['OK', 'Pause', 'Fehler', 'Zurueck'],
        correctIndex: 0
      }
    };
  }
}
