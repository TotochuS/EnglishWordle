/**
 * script.js — WordLearn v2
 * Lit les paramètres d'URL pour la longueur et le niveau,
 * gère la logique complète du jeu front-end.
 */

// ══════════════════════════════════════════════════════
// PARAMÈTRES URL
// ══════════════════════════════════════════════════════
const urlParams  = new URLSearchParams(window.location.search);
const WORD_LENGTH = parseInt(urlParams.get("length")) || 0;
const WORD_LEVEL  = urlParams.get("level") || "B1";

// ══════════════════════════════════════════════════════
// ÉTAT DU JEU
// ══════════════════════════════════════════════════════
const GameState = {
  wordLength:  0,
  currentRow:  0,
  currentCol:  0,
  maxAttempts: 6,
  lives:       3,
  score:       0,
  gameOver:    false,
  wordOver:    false,
  hintUsed:    false,
};

let grid      = [];
let keyStates = {};

// ══════════════════════════════════════════════════════
// INITIALISATION
// ══════════════════════════════════════════════════════

function restartGame() {
  GameState.lives    = 3;
  GameState.score    = 0;
  GameState.gameOver = false;

  document.getElementById("gameover-overlay").classList.remove("visible");

  for (let i = 1; i <= 3; i++) {
    document.getElementById(`life-${i}`).classList.remove("lost");
  }

  updateScoreDisplay();
  startNewWord();
}

async function startNewWord() {
  GameState.currentRow = 0;
  GameState.currentCol = 0;
  GameState.wordOver   = false;
  GameState.hintUsed   = false;
  keyStates            = {};

  const hintText = document.getElementById("hint-text");
  hintText.textContent = "";
  hintText.classList.remove("visible");

  setStatus("Loading new word…", "info");

  // Build query string
  let url = "/api/new-word";
  const params = [];
  if (WORD_LENGTH) params.push(`length=${WORD_LENGTH}`);
  if (WORD_LEVEL)  params.push(`level=${WORD_LEVEL}`);
  if (params.length) url += "?" + params.join("&");

  try {
    const resp = await fetch(url);
    const data = await resp.json();

    if (!resp.ok) {
      setStatus(data.error || "Could not load word.", "error");
      return;
    }

    GameState.wordLength = data.word_length;

    // Show level chip
    const chip = document.getElementById("level-chip");
    if (chip && data.level) {
      chip.textContent = data.level;
      chip.dataset.level = data.level;
    }

    buildGrid();
    resetKeyboard();
    updateDictCount();

    setStatus(`Guess the ${GameState.wordLength}-letter word! [${data.level}]`);

  } catch (err) {
    console.error("Error loading word:", err);
    setStatus("Failed to load word. Please refresh.", "error");
  }
}

// ══════════════════════════════════════════════════════
// GRILLE
// ══════════════════════════════════════════════════════

function buildGrid() {
  const gridEl = document.getElementById("game-grid");
  gridEl.innerHTML = "";
  grid = [];

  for (let r = 0; r < GameState.maxAttempts; r++) {
    grid.push(Array(GameState.wordLength).fill(""));
    const row = document.createElement("div");
    row.className = "grid-row";
    row.id = `row-${r}`;

    for (let c = 0; c < GameState.wordLength; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.id = `cell-${r}-${c}`;
      row.appendChild(cell);
    }
    gridEl.appendChild(row);
  }
}

// ══════════════════════════════════════════════════════
// SAISIE
// ══════════════════════════════════════════════════════

document.addEventListener("keydown", (e) => {
  if (GameState.gameOver || GameState.wordOver) return;
  const key = e.key.toUpperCase();
  if (key === "ENTER")          submitGuess();
  else if (key === "BACKSPACE") deleteLetter();
  else if (/^[A-Z]$/.test(key)) addLetter(key);
});

document.getElementById("keyboard").addEventListener("click", (e) => {
  if (GameState.gameOver || GameState.wordOver) return;
  const btn = e.target.closest(".key");
  if (!btn) return;
  const key = btn.dataset.key;
  if (key === "ENTER")          submitGuess();
  else if (key === "BACKSPACE") deleteLetter();
  else                          addLetter(key);
});

function addLetter(letter) {
  if (GameState.currentCol >= GameState.wordLength) return;
  grid[GameState.currentRow][GameState.currentCol] = letter;
  const cell = document.getElementById(`cell-${GameState.currentRow}-${GameState.currentCol}`);
  cell.textContent = letter;
  cell.classList.add("filled");
  GameState.currentCol++;
}

function deleteLetter() {
  if (GameState.currentCol <= 0) return;
  GameState.currentCol--;
  grid[GameState.currentRow][GameState.currentCol] = "";
  const cell = document.getElementById(`cell-${GameState.currentRow}-${GameState.currentCol}`);
  cell.textContent = "";
  cell.classList.remove("filled");
}

// ══════════════════════════════════════════════════════
// ENVOI
// ══════════════════════════════════════════════════════

async function submitGuess() {
  if (GameState.currentCol < GameState.wordLength) {
    setStatus(`Word must be ${GameState.wordLength} letters long!`, "error");
    shakeRow(GameState.currentRow);
    return;
  }

  const guess = grid[GameState.currentRow].join("");

  try {
    const resp = await fetch("/api/guess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guess })
    });

    const data = await resp.json();

    if (!resp.ok) {
      setStatus(data.error || "Invalid word.", "error");
      shakeRow(GameState.currentRow);
      return;
    }

    await animateRow(GameState.currentRow, data.result);
    updateKeyboard(guess, data.result);

    if (data.won) {
      const pointsEarned = calculateScore(data.attempts);
      GameState.score += pointsEarned;
      updateScoreDisplay(true);
      setStatus("🎉 Excellent! You got it!", "success");
      bounceRow(GameState.currentRow);
      setTimeout(() => showWordModal(true, data.reveal, pointsEarned), 900);

    } else if (data.reveal) {
      setStatus(`The word was: ${data.reveal.word}`, "error");
      loseLife();
      setTimeout(() => showWordModal(false, data.reveal, 0), 800);

    } else {
      GameState.currentRow++;
      GameState.currentCol = 0;
      setStatus(`${GameState.maxAttempts - data.attempts} attempt(s) left`);
    }

  } catch (err) {
    console.error("Error submitting guess:", err);
    setStatus("Server error. Please try again.", "error");
  }
}

// ══════════════════════════════════════════════════════
// ANIMATIONS
// ══════════════════════════════════════════════════════

function animateRow(rowIndex, results) {
  return new Promise((resolve) => {
    const DELAY = 260;
    results.forEach((result, col) => {
      setTimeout(() => {
        const cell = document.getElementById(`cell-${rowIndex}-${col}`);
        cell.classList.add(result);
        if (col === results.length - 1) {
          setTimeout(resolve, 500);
        }
      }, col * DELAY);
    });
  });
}

function shakeRow(rowIndex) {
  const row = document.getElementById(`row-${rowIndex}`);
  row.classList.add("shake");
  setTimeout(() => row.classList.remove("shake"), 500);
}

function bounceRow(rowIndex) {
  const row = document.getElementById(`row-${rowIndex}`);
  row.classList.add("win-bounce");
}

// ══════════════════════════════════════════════════════
// CLAVIER
// ══════════════════════════════════════════════════════

function updateKeyboard(guess, results) {
  const priorityOrder = { correct: 3, present: 2, absent: 1 };
  results.forEach((result, i) => {
    const letter = guess[i];
    const currentPriority = priorityOrder[keyStates[letter]] || 0;
    const newPriority = priorityOrder[result];
    if (newPriority > currentPriority) {
      keyStates[letter] = result;
      const btn = document.querySelector(`.key[data-key="${letter}"]`);
      if (btn) {
        btn.classList.remove("correct", "present", "absent");
        btn.classList.add(result);
      }
    }
  });
}

function resetKeyboard() {
  document.querySelectorAll(".key").forEach(btn => {
    btn.classList.remove("correct", "present", "absent");
  });
}

// ══════════════════════════════════════════════════════
// INDICE
// ══════════════════════════════════════════════════════

async function requestHint() {
  if (GameState.hintUsed || GameState.wordOver) return;
  try {
    const resp = await fetch("/api/hint");
    const data = await resp.json();
    const hintEl = document.getElementById("hint-text");
    hintEl.textContent = `💡 ${data.hint}`;
    hintEl.classList.add("visible");
    GameState.hintUsed = true;
  } catch (err) {
    console.error("Error fetching hint:", err);
  }
}

// ══════════════════════════════════════════════════════
// SCORE & VIES
// ══════════════════════════════════════════════════════

function calculateScore(attempts) {
  const baseScore = 100;
  const bonusPerAttemptSaved = 20;
  return baseScore + (GameState.maxAttempts - attempts) * bonusPerAttemptSaved;
}

function updateScoreDisplay(animate = false) {
  const el = document.getElementById("score-display");
  el.textContent = GameState.score;
  if (animate) {
    el.style.animation = "none";
    el.offsetHeight;
    el.style.animation = "scoreFlash 0.4s ease";
  }
}

function loseLife() {
  if (GameState.lives <= 0) return;
  GameState.lives--;
  const lifeEl = document.getElementById(`life-${GameState.lives + 1}`);
  if (lifeEl) lifeEl.classList.add("lost");
  if (GameState.lives === 0) GameState.gameOver = true;
}

// ══════════════════════════════════════════════════════
// MODALES
// ══════════════════════════════════════════════════════

const LEVEL_COLORS = {
  A1: { bg: "#1a3d2b", color: "#4caf7d" },
  A2: { bg: "#1e4533", color: "#64c88c" },
  B1: { bg: "#3d2e00", color: "#f5a623" },
  B2: { bg: "#4a3800", color: "#ffb43c" },
  C1: { bg: "#300a4a", color: "#c078e8" },
  C2: { bg: "#3d0808", color: "#e05252" },
};

function showWordModal(won, revealData, pointsEarned) {
  GameState.wordOver = true;

  document.getElementById("modal-result-icon").textContent = won ? "🎉" : "😔";
  document.getElementById("modal-word").textContent = revealData.word;
  document.getElementById("modal-definition").textContent = revealData.definition;
  document.getElementById("modal-funfact").textContent = revealData.fun_fact;

  // Level badge
  const levelBadge = document.getElementById("modal-level-badge");
  if (revealData.level && LEVEL_COLORS[revealData.level]) {
    const lc = LEVEL_COLORS[revealData.level];
    levelBadge.innerHTML = `<span style="background:${lc.bg};color:${lc.color};border:1px solid ${lc.color}44;border-radius:20px;padding:3px 12px;font-size:11px;letter-spacing:2px;font-weight:700;">${revealData.level}</span>`;
  } else {
    levelBadge.innerHTML = "";
  }

  const scoreEl = document.getElementById("modal-score-earned");
  if (won) {
    scoreEl.textContent = `+${pointsEarned} points earned!`;
    scoreEl.style.color = "";
  } else {
    scoreEl.textContent = "No points this round — you'll get the next one!";
    scoreEl.style.color = "var(--text-muted)";
  }

  document.getElementById("modal-overlay").classList.add("visible");
  updateDictCount();
}

function nextWord() {
  document.getElementById("modal-overlay").classList.remove("visible");
  if (GameState.gameOver) {
    document.getElementById("final-score").textContent = GameState.score;
    document.getElementById("gameover-overlay").classList.add("visible");
  } else {
    startNewWord();
  }
}

// ══════════════════════════════════════════════════════
// DICT COUNT
// ══════════════════════════════════════════════════════

async function updateDictCount() {
  try {
    const resp = await fetch("/api/dictionary");
    const data = await resp.json();
    const el = document.getElementById("dict-float-count");
    if (el) el.textContent = data.words.length;
  } catch(e) {}
}

// ══════════════════════════════════════════════════════
// UTILITAIRES
// ══════════════════════════════════════════════════════

function setStatus(message, type = "") {
  const el = document.getElementById("status-message");
  el.textContent = message;
  el.className = type;
}

// ══════════════════════════════════════════════════════
// LANCEMENT
// ══════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  restartGame();
});
