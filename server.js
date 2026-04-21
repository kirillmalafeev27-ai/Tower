const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const AITUNNEL_BASE_URL = (process.env.AITUNNEL_BASE_URL || 'https://api.aitunnel.ru/v1').replace(/\/+$/, '');
const MODEL_NAME = process.env.AITUNNEL_MODEL || 'gpt-5.4';
const REQUEST_TIMEOUT_MS = Math.max(10000, Number(process.env.AITUNNEL_TIMEOUT_MS) || 45000);
const DEFAULT_QUESTIONS_COUNT = 10;
const MAX_GENERATION_ATTEMPTS = 2;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const questionPool = Object.create(null);

const TOPIC_RULES = {
  'infinitiv mit zu':
    'Verwende nur Verben und Ausdruecke, die "zu + Infinitiv" verlangen: versuchen, beginnen, anfangen, aufhoeren, vorhaben, hoffen, vergessen, planen, sich freuen, Lust haben, es ist wichtig/moeglich/schwer. Verwende niemals Modalverben mit "zu". Richtig: "Er versucht, den Bahnhof zu finden." Falsch: "Er kann den Bahnhof zu finden."',
  modalverben:
    'Verwende nur Modalverben: koennen, muessen, sollen, wollen, duerfen, moegen/moechten. Das Modalverb steht auf Position 2, der reine Infinitiv steht am Satzende ohne "zu". Richtig: "Er kann den Bahnhof finden." Falsch: "Er kann den Bahnhof zu finden."',
  perfekt:
    'Im Perfekt gilt: sein + Partizip II bei Bewegungsverben und Zustandsaenderungen, haben + Partizip II bei den meisten anderen Verben. Achte auf richtige Partizipbildung, trennbare und untrennbare Praefixe sowie Verben auf -ieren ohne ge-.',
  praeteritum:
    'Im Praeteritum muessen regelmaessige, unregelmaessige und Mischverben korrekt gebeugt werden. Regelmaessige Verben haben -te-Endungen, unregelmaessige Verben oft Stammvokalwechsel ohne -te, Mischverben kombinieren Vokalwechsel und -te.',
  dativ:
    'Verwende Dativpraepositionen oder Dativverben korrekt: mit, nach, bei, seit, von, zu, aus, gegenueber, ab; helfen, danken, gehoeren, gefallen, schmecken, passen, gratulieren, antworten, folgen. Achte auf die Formen dem, der, den + -n, einem, einer.',
  akkusativ:
    'Verwende Akkusativpraepositionen und transitive Verben korrekt: durch, fuer, gegen, ohne, um; sehen, kaufen, essen, trinken, lesen, schreiben, brauchen, haben, finden. Achte auf die Formen den, die, das, einen.',
  genitiv:
    'Verwende Genitivpraepositionen korrekt: wegen, trotz, waehrend, innerhalb, ausserhalb, statt/anstatt. Maskulin und Neutrum brauchen des/eines + -(e)s, feminin der/einer, Plural der ohne zusaetzliche Endung.',
  adjektivdeklination:
    'Achte auf die richtige Adjektivdeklination nach bestimmtem Artikel, unbestimmtem Artikel oder ohne Artikel. Richtig: "ein alter Mann", "mit dem alten Mann". Falsch: "ein alten Mann", "mit dem alter Mann".',
  wechselpraepositionen:
    'Verwende Wechselpraepositionen korrekt: an, auf, hinter, in, neben, ueber, unter, vor, zwischen. Wohin? Bewegung/Richtung -> Akkusativ. Wo? Position/Ort -> Dativ.',
  negation:
    'Verwende "nicht" fuer Verben, Adjektive, Adverbien und Praepositionalphrasen; "kein" ersetzt den unbestimmten Artikel oder Nullartikel vor Nomen. Richtig: "Ich habe kein Auto." und "Ich komme nicht aus Berlin."',
  wortstellung:
    'Im Hauptsatz steht das finite Verb immer auf Position 2. Steht ein Adverb oder Objekt auf Position 1, folgt Inversion. Im Nebensatz steht das finite Verb am Ende. Wenn eine Inversion grammatisch korrekt ist, darf sie nicht als falsche Antwort erscheinen.',
  'wortstellung im hauptsatz':
    'Im Hauptsatz steht das finite Verb immer auf Position 2. Nach einem Satzglied auf Position 1 folgt das finite Verb und danach meist das Subjekt. Richtig: "Gestern ging ich ins Kino." Falsch: "Gestern ich ging ins Kino."',
  'wortstellung im nebensatz':
    'Nach Konjunktionen wie weil, dass, wenn, ob, als, nachdem, obwohl steht das finite Verb am Satzende. Im Perfekt steht das Hilfsverb ganz am Ende. Richtig: "Ich weiss, dass er morgen kommt."',
  'dass saetze':
    'Verwende "dass" nur mit Nebensatzwortstellung, also Verb am Ende. Richtig: "Ich glaube, dass er recht hat." Falsch: "Ich glaube, dass er hat recht."',
  'weil saetze':
    'Verwende "weil" nur mit Nebensatzwortstellung, also Verb am Ende. Richtig: "Ich bleibe zu Hause, weil ich krank bin." Falsch: "Ich bleibe zu Hause, weil ich bin krank."',
  'wenn saetze':
    'Verwende "wenn" mit Verb am Ende im Nebensatz. Nach einem vorangestellten wenn-Satz steht im Hauptsatz das finite Verb auf Position 1 und dann das Subjekt. Richtig: "Wenn es regnet, bleibe ich zu Hause."',
  relativsaetze:
    'Im Relativsatz richtet sich das Relativpronomen im Genus und Numerus nach dem Bezugswort, aber der Kasus nach seiner Funktion im Nebensatz. Das finite Verb steht am Ende des Relativsatzes.',
  relativpronomen:
    'Waehle das Relativpronomen nach Genus und Numerus des Bezugsworts, aber bestimme den Kasus nach der Funktion im Relativsatz: Subjekt -> Nominativ, direktes Objekt -> Akkusativ, indirektes Objekt -> Dativ, Besitz -> Genitiv.',
  'konjunktiv ii':
    'Verwende Konjunktiv II fuer irreale Wuensche, hoefliche Bitten und Ratschlaege, meist mit "wuerde + Infinitiv" oder mit Formen wie waere, haette, koennte, muesste, sollte, duerfte, wuesste, kaeme, ginge, braeuchte.',
  passiv:
    'Verwende das Vorgangspassiv mit werden + Partizip II und das Zustandspassiv mit sein + Partizip II. Im Perfekt des Vorgangspassivs: ist + Partizip II + worden.',
  praesens:
    'Im Praesens muessen die Endungen korrekt sein: -e, -st, -t, -en, -t, -en. Achte auf Stammvokalwechsel in der 2. und 3. Person Singular sowie auf den Bindevokal bei Verben auf -ten oder -den.',
  'futur i':
    'Verwende Futur I mit werden + Infinitiv. Richtig: "Ich werde morgen kommen." Falsch: "Ich werde morgen zu kommen."',
  imperativ:
    'Bilde den Imperativ korrekt fuer du, ihr und Sie. Du-Form ohne Pronomen und ohne -st; ihr-Form wie Praesens ohne "ihr"; Sie-Form = Infinitiv + Sie.',
  artikel:
    'Achte auf den richtigen Artikel und das passende Genus: der, die, das, die; ein, eine. Nutze sinnvolle Nomen und bleibe bei natuerlichen Beispielen.',
  nominativ:
    'Verwende den Nominativ fuer das Subjekt und fuer Praedikative nach sein, werden und bleiben. Richtig: "Der Mann ist ein guter Lehrer." Falsch: "Der Mann ist einen guten Lehrer."',
  'praepositionen mit dativ':
    'Verwende nur Dativpraepositionen: mit, nach, bei, seit, von, zu, aus, gegenueber, ab. Die Form nach der Praeposition muss im Dativ stehen.',
  'praepositionen mit akkusativ':
    'Verwende nur Akkusativpraepositionen: durch, fuer, gegen, ohne, um. Die Form nach der Praeposition muss im Akkusativ stehen.',
  genitivpraepositionen:
    'Verwende nur Genitivpraepositionen wie wegen, trotz, waehrend, innerhalb, ausserhalb, statt/anstatt. Die Form nach der Praeposition muss im Genitiv stehen.'
};

function normalizeTopicKey(topic = '') {
  return String(topic)
    .replace(/\u00E4|\u00C4/g, 'ae')
    .replace(/\u00F6|\u00D6/g, 'oe')
    .replace(/\u00FC|\u00DC/g, 'ue')
    .replace(/\u00DF/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDisplay(value) {
  return normalizeWhitespace(value).replace(/\s*\/\s*/g, ' ');
}

function getTopicRule(grammarTopic) {
  return TOPIC_RULES[normalizeTopicKey(grammarTopic)] || '';
}

function hasUniqueOptions(options) {
  const normalized = options.map((option) => normalizeWhitespace(option));
  return new Set(normalized).size === normalized.length;
}

function isValidQuestion(question, { isWortstellung }) {
  if (
    !question ||
    typeof question.text !== 'string' ||
    typeof question.display !== 'string' ||
    !Array.isArray(question.options) ||
    question.options.length !== 4 ||
    typeof question.correct !== 'number' ||
    question.correct < 0 ||
    question.correct > 3
  ) {
    return false;
  }

  if (!question.options.every((option) => typeof option === 'string' && normalizeWhitespace(option))) {
    return false;
  }

  if (!normalizeWhitespace(question.text) || !normalizeWhitespace(question.display)) {
    return false;
  }

  if (!hasUniqueOptions(question.options)) {
    return false;
  }

  if (isWortstellung) {
    const correctAnswer = question.options[question.correct];
    if (!question.display.includes('/')) {
      return false;
    }

    if (normalizeDisplay(question.display) === normalizeWhitespace(correctAnswer)) {
      return false;
    }
  }

  return true;
}

function buildSystemPrompt() {
  return 'Du bist ein sehr genauer Autor fuer Deutschuebungen. Befolge alle Regeln strikt, schreibe natuerliche Saetze und liefere nur Inhalte, die exakt zur geforderten JSON-Struktur passen.';
}

function buildTaskDescription({
  questionsCount,
  lexicalTopic,
  grammarTopic,
  isWortstellung,
}) {
  if (isWortstellung) {
    return `Erstelle ${questionsCount} Uebungen zur deutschen Wortstellung.
Grammatikthema: ${grammarTopic}.
${lexicalTopic ? `Lexikalisches Thema: ${lexicalTopic}. Alle Saetze muessen Woerter aus diesem Thema verwenden.` : 'Es gibt kein zusaetzliches lexikalisches Thema.'}

Format:
- text: eine kurze Anweisung auf Russisch.
- display: deutsche Woerter oder Satzteile, getrennt durch " / ", in zufaelliger Reihenfolge.
- options: 4 vollstaendige deutsche Saetze.

Wichtige Bedingungen:
- display MUSS aktiv gemischt werden und darf niemals mit dem korrekten Satz identisch sein.
- Genau eine Option darf korrekt sein.
- Wenn eine Inversion ebenfalls grammatisch korrekt ist, darf sie nicht als falsche Option erscheinen.
- Falsche Optionen muessen einen klaren Fehler in der Wortstellung enthalten, zum Beispiel Verb nicht auf Position 2 im Hauptsatz oder falsche Verbposition im Nebensatz.
- Jede Aufgabe muss einen anderen Satz verwenden.
- Alle Saetze muessen natuerlich und lerngeeignet sein.`;
  }

  return `Erstelle ${questionsCount} Grammatikuebungen fuer Deutschlernende.
Grammatikthema: ${grammarTopic}.
${lexicalTopic ? `Lexikalisches Thema: ${lexicalTopic}. Alle Saetze muessen Woerter aus diesem Thema verwenden.` : 'Es gibt kein zusaetzliches lexikalisches Thema.'}

Format:
- text: eine kurze Anweisung auf Russisch.
- display: ein deutsches Satzfragment oder ein deutscher Satz mit einer Luecke ___.
- options: 4 deutsche Antwortmoeglichkeiten.

Wichtige Bedingungen:
- Genau eine Option darf korrekt sein.
- Jede falsche Option soll einen klaren, plausiblen Grammatikfehler enthalten.
- Jede Aufgabe muss einen anderen Satz verwenden.
- Alle Saetze muessen natuerlich und lerngeeignet sein.`;
}

function buildPrompt({
  level,
  lexicalTopic,
  grammarTopic,
  isWortstellung,
  questionsCount,
  exclude,
}) {
  const topicRule = getTopicRule(grammarTopic);
  const excludeNote =
    exclude && exclude.length
      ? `\nVerwende diese display-Werte nicht erneut: ${exclude
          .slice(-10)
          .map((item) => `"${item}"`)
          .join(', ')}`
      : '';

  const taskDescription = buildTaskDescription({
    questionsCount,
    lexicalTopic,
    grammarTopic,
    isWortstellung,
  });

  return `${taskDescription}

CEFR-Niveau: ${level}. Halte Wortschatz, Satzlaenge und grammatische Komplexitaet streng auf diesem Niveau. Verwende keine Strukturen deutlich ueber ${level}.
${topicRule ? `Spezielle Regel fuer das Thema "${grammarTopic}": ${topicRule}` : `Halte dich streng an die Grammatik des Themas "${grammarTopic}".`}
${excludeNote}

Allgemeine Regeln:
1. Der korrekte Satz muss grammatisch einwandfrei sein.
2. Die falschen Optionen duerfen nicht absurd sein, sondern muessen wie typische Lernfehler wirken.
3. Die Position des korrekten Index soll ueber mehrere Aufgaben hinweg gemischt sein.
4. text muss auf Russisch sein, aber alle Inhalte in display und options muessen auf Deutsch sein.
5. Antworte ausschliesslich mit JSON, das exakt dem vorgegebenen Schema entspricht.
6. Fuege keine Erklaerungen, keinen Fliesstext und kein Markdown hinzu.`;
}

function buildQuestionSchema({ isWortstellung, questionsCount }) {
  const displayDescription = isWortstellung
    ? 'Zufaellig gemischte deutsche Woerter oder Satzteile, getrennt durch " / ". Darf nicht der korrekten Reihenfolge entsprechen.'
    : 'Ein deutsches Satzfragment oder ein deutscher Satz mit genau einer Luecke ___.';

  return {
    name: isWortstellung ? 'wortstellung_questions' : 'grammar_questions',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['questions'],
      properties: {
        questions: {
          type: 'array',
          minItems: questionsCount,
          maxItems: questionsCount,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['text', 'display', 'options', 'correct'],
            properties: {
              text: {
                type: 'string',
                description: 'Kurze Anweisung auf Russisch.'
              },
              display: {
                type: 'string',
                description: displayDescription
              },
              options: {
                type: 'array',
                minItems: 4,
                maxItems: 4,
                items: {
                  type: 'string'
                },
                description: 'Vier vollstaendige deutsche Antwortoptionen.'
              },
              correct: {
                type: 'integer',
                minimum: 0,
                maximum: 3,
                description: 'Index der einzig richtigen Antwort.'
              }
            }
          }
        }
      }
    }
  };
}

function extractMessageText(content) {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (part && typeof part.text === 'string') {
          return part.text;
        }

        return '';
      })
      .join('')
      .trim();
  }

  if (content && typeof content === 'object') {
    return JSON.stringify(content);
  }

  return '';
}

function parseGeneratedQuestions(payload) {
  const message = payload?.choices?.[0]?.message;
  if (!message) {
    throw new Error('AITUNNEL returned no message content');
  }

  if (message.refusal) {
    throw new Error(`Model refused the request: ${message.refusal}`);
  }

  const rawText = extractMessageText(message.content);
  if (!rawText) {
    throw new Error('AITUNNEL returned an empty response');
  }

  const jsonText = rawText.replace(/^```json\s*|\s*```$/g, '').trim();
  const parsed = JSON.parse(jsonText);
  const questions = Array.isArray(parsed) ? parsed : parsed.questions;

  if (!Array.isArray(questions)) {
    throw new Error('Model response does not contain a questions array');
  }

  return questions;
}

async function generateValidQuestions({
  prompt,
  isWortstellung,
  questionsCount
}) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const payload = await requestQuestionsFromAitunnel({
        prompt,
        isWortstellung,
        questionsCount
      });

      const parsedQuestions = parseGeneratedQuestions(payload);
      const validQuestions = parsedQuestions.filter((question) =>
        isValidQuestion(question, { isWortstellung })
      );

      if (validQuestions.length > 0) {
        return validQuestions;
      }

      lastError = new Error('Das Modell hat keine validen Aufgaben erzeugt.');
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Unbekannter Fehler bei der Aufgabengenerierung.');
}

async function requestQuestionsFromAitunnel({ prompt, isWortstellung, questionsCount }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${AITUNNEL_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.AITUNNEL_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        max_tokens: 8192,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: prompt }
        ],
        structured_outputs: true,
        response_format: {
          type: 'json_schema',
          json_schema: buildQuestionSchema({ isWortstellung, questionsCount })
        }
      }),
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const detail =
        payload?.error?.message ||
        payload?.error?.code ||
        response.statusText ||
        'Unknown AITUNNEL error';
      throw new Error(`AITUNNEL request failed (${response.status}): ${detail}`);
    }

    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/generate-questions', async (req, res) => {
  const { level, lexicalTopic, grammarTopic, isWortstellung, count, exclude } = req.body || {};

  if (!level || !grammarTopic) {
    return res.status(400).json({ error: 'level and grammarTopic are required' });
  }

  if (!process.env.AITUNNEL_API_KEY) {
    return res.status(503).json({ error: 'AITUNNEL_API_KEY is not configured' });
  }

  const questionsCount = Math.max(1, Math.min(50, Number(count) || DEFAULT_QUESTIONS_COUNT));
  const cacheKey = `${level}:${grammarTopic}:${lexicalTopic || ''}:${isWortstellung ? 'w' : 'g'}`;

  if (questionPool[cacheKey] && questionPool[cacheKey].length >= questionsCount) {
    const cached = questionPool[cacheKey].splice(0, questionsCount);
    return res.json({ questions: cached });
  }

  try {
    const prompt = buildPrompt({
      level,
      lexicalTopic,
      grammarTopic,
      isWortstellung,
      questionsCount,
      exclude
    });

    const validQuestions = await generateValidQuestions({
      prompt,
      isWortstellung,
      questionsCount
    });

    if (validQuestions.length > questionsCount) {
      questionPool[cacheKey] = questionPool[cacheKey] || [];
      questionPool[cacheKey].push(...validQuestions.slice(questionsCount));
    }

    return res.json({ questions: validQuestions.slice(0, questionsCount) });
  } catch (error) {
    console.error('Question generation failed:', error);
    return res.status(500).json({
      error: 'Failed to generate questions',
      detail: error.message
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function startServer(port = PORT) {
  return app.listen(port, () => {
    console.log(`Drucker game running on port ${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer
};
