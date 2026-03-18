/**
 * script.js — LexiForge Wordle Game
 * Gère toute la logique front-end :
 * - Saisie clavier physique & virtuel
 * - Envoi des tentatives via Fetch/AJAX
 * - Animation de la grille et du clavier
 * - Système de vies, score, et modales éducatives
 */

// ══════════════════════════════════════════════════════
// ÉTAT DU JEU
// ══════════════════════════════════════════════════════

const GameState = {
  wordLength:   0,       // Longueur du mot courant
  currentRow:   0,       // Ligne active (tentative en cours)
  currentCol:   0,       // Colonne active (lettre en cours)
  maxAttempts:  6,       // Nombre max de tentatives
  lives:        3,       // Vies restantes
  score:        0,       // Score courant
  gameOver:     false,   // Partie terminée ?
  wordOver:     false,   // Mot en cours terminé (modale ouverte) ?
  hintUsed:     false,   // Indice déjà révélé pour ce mot ?
};

// Tableau de la grille : grille[row][col] = lettre
let grid = [];

// État des touches du clavier : { 'A': 'correct', 'B': 'absent', ... }
let keyStates = {};

// ══════════════════════════════════════════════════════
// INITIALISATION
// ══════════════════════════════════════════════════════

/**
 * Lance une nouvelle session de jeu complète (reset tout)
 */
function restartGame() {
  GameState.lives    = 3;
  GameState.score    = 0;
  GameState.gameOver = false;

  // Masquer la modale Game Over
  document.getElementById("gameover-overlay").classList.remove("visible");

  // Reset l'affichage des vies
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`life-${i}`);
    el.classList.remove("lost");
  }

  updateScoreDisplay();
  startNewWord();
}

/**
 * Démarre un nouveau mot (appel API, construction de la grille)
 */
async function startNewWord() {
  // Reset de l'état courant du mot
  GameState.currentRow = 0;
  GameState.currentCol = 0;
  GameState.wordOver   = false;
  GameState.hintUsed   = false;
  keyStates            = {};

  // Masquer l'indice
  const hintText = document.getElementById("hint-text");
  hintText.textContent = "";
  hintText.classList.remove("visible");

  setStatus("Loading new word…", "info");

  try {
    const resp = await fetch("/api/new-word");
    const data = await resp.json();

    GameState.wordLength = data.word_length;

    // Construire la grille
    buildGrid();

    // Réinitialiser le clavier
    resetKeyboard();

    setStatus(`Guess the ${GameState.wordLength}-letter English word!`);

  } catch (err) {
    console.error("Error loading word:", err);
    setStatus("Failed to load word. Please refresh.", "error");
  }
}

// ══════════════════════════════════════════════════════
// CONSTRUCTION DE LA GRILLE
// ══════════════════════════════════════════════════════

/**
 * Génère dynamiquement la grille selon la longueur du mot
 */
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
// SAISIE CLAVIER
// ══════════════════════════════════════════════════════

/**
 * Écoute du clavier physique
 */
document.addEventListener("keydown", (e) => {
  if (GameState.gameOver || GameState.wordOver) return;

  const key = e.key.toUpperCase();

  if (key === "ENTER") {
    submitGuess();
  } else if (key === "BACKSPACE") {
    deleteLetter();
  } else if (/^[A-Z]$/.test(key)) {
    addLetter(key);
  }
});

/**
 * Écoute du clavier virtuel (boutons)
 */
document.getElementById("keyboard").addEventListener("click", (e) => {
  if (GameState.gameOver || GameState.wordOver) return;

  const btn = e.target.closest(".key");
  if (!btn) return;

  const key = btn.dataset.key;
  if (key === "ENTER") {
    submitGuess();
  } else if (key === "BACKSPACE") {
    deleteLetter();
  } else {
    addLetter(key);
  }
});

/**
 * Ajoute une lettre à la ligne courante
 */
function addLetter(letter) {
  if (GameState.currentCol >= GameState.wordLength) return;

  grid[GameState.currentRow][GameState.currentCol] = letter;
  const cell = document.getElementById(`cell-${GameState.currentRow}-${GameState.currentCol}`);
  cell.textContent = letter;
  cell.classList.add("filled");

  GameState.currentCol++;
}

/**
 * Supprime la dernière lettre saisie
 */
function deleteLetter() {
  if (GameState.currentCol <= 0) return;

  GameState.currentCol--;
  grid[GameState.currentRow][GameState.currentCol] = "";

  const cell = document.getElementById(`cell-${GameState.currentRow}-${GameState.currentCol}`);
  cell.textContent = "";
  cell.classList.remove("filled");
}

// ══════════════════════════════════════════════════════
// ENVOI DE LA TENTATIVE
// ══════════════════════════════════════════════════════

/**
 * Envoie la tentative courante au serveur et traite la réponse
 */
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

    // Animer les cellules avec les résultats
    await animateRow(GameState.currentRow, data.result);

    // Mettre à jour le clavier
    updateKeyboard(guess, data.result);

    // Vérifier si gagné
    if (data.won) {
      const pointsEarned = calculateScore(data.attempts);
      GameState.score += pointsEarned;
      updateScoreDisplay(true);

      setStatus("🎉 Excellent! You got it!", "success");
      bounceRow(GameState.currentRow);

      // Délai avant la modale pour laisser l'animation se terminer
      setTimeout(() => showWordModal(true, data.reveal, pointsEarned), 900);

    } else if (data.reveal) {
      // 6 tentatives épuisées → perdu
      setStatus(`The word was: ${data.reveal.word}`, "error");
      loseLife();

      setTimeout(() => showWordModal(false, data.reveal, 0), 800);

    } else {
      // Continuer
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

/**
 * Anime les cellules d'une ligne avec un délai progressif (effet de cascade)
 * @returns {Promise} résolu quand toutes les animations sont terminées
 */
function animateRow(rowIndex, results) {
  return new Promise((resolve) => {
    const DELAY = 280; // ms entre chaque cellule

    results.forEach((result, col) => {
      setTimeout(() => {
        const cell = document.getElementById(`cell-${rowIndex}-${col}`);
        cell.classList.add(result);

        // Résoudre après la dernière cellule
        if (col === results.length - 1) {
          setTimeout(resolve, 500); // Laisser l'anim flip se terminer
        }
      }, col * DELAY);
    });
  });
}

/**
 * Anime l'erreur de saisie (tremblement)
 */
function shakeRow(rowIndex) {
  const row = document.getElementById(`row-${rowIndex}`);
  row.classList.add("shake");
  setTimeout(() => row.classList.remove("shake"), 500);
}

/**
 * Anime la victoire (rebond)
 */
function bounceRow(rowIndex) {
  const row = document.getElementById(`row-${rowIndex}`);
  row.classList.add("win-bounce");
}

// ══════════════════════════════════════════════════════
// CLAVIER VIRTUEL
// ══════════════════════════════════════════════════════

/**
 * Met à jour la couleur des touches du clavier selon les résultats
 * Priorité : correct > present > absent
 */
function updateKeyboard(guess, results) {
  const priorityOrder = { correct: 3, present: 2, absent: 1 };

  results.forEach((result, i) => {
    const letter = guess[i];
    const currentPriority = priorityOrder[keyStates[letter]] || 0;
    const newPriority = priorityOrder[result];

    if (newPriority > currentPriority) {
      keyStates[letter] = result;

      // Mettre à jour le bouton
      const btn = document.querySelector(`.key[data-key="${letter}"]`);
      if (btn) {
        btn.classList.remove("correct", "present", "absent");
        btn.classList.add(result);
      }
    }
  });
}

/**
 * Réinitialise toutes les touches du clavier
 */
function resetKeyboard() {
  document.querySelectorAll(".key").forEach((btn) => {
    btn.classList.remove("correct", "present", "absent");
  });
}

// ══════════════════════════════════════════════════════
// INDICE (HINT)
// ══════════════════════════════════════════════════════

/**
 * Demande et affiche l'indice du mot courant
 */
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

/**
 * Calcule les points gagnés selon le nombre de tentatives
 * Plus vite = plus de points
 */
function calculateScore(attempts) {
  const baseScore = 100;
  const bonusPerAttemptSaved = 20;
  return baseScore + (GameState.maxAttempts - attempts) * bonusPerAttemptSaved;
}

/**
 * Met à jour l'affichage du score (avec animation optionnelle)
 */
function updateScoreDisplay(animate = false) {
  const el = document.getElementById("score-display");
  el.textContent = GameState.score;
  if (animate) {
    el.style.animation = "none";
    el.offsetHeight; // Force reflow
    el.style.animation = "scoreFlash 0.4s ease";
  }
}

/**
 * Retire une vie et met à jour l'affichage
 */
function loseLife() {
  if (GameState.lives <= 0) return;

  GameState.lives--;
  const lifeEl = document.getElementById(`life-${GameState.lives + 1}`);
  if (lifeEl) lifeEl.classList.add("lost");

  if (GameState.lives === 0) {
    GameState.gameOver = true;
  }
}

// ══════════════════════════════════════════════════════
// MODALES
// ══════════════════════════════════════════════════════

/**
 * Affiche la modale éducative après chaque mot (gagné ou perdu)
 */
function showWordModal(won, revealData, pointsEarned) {
  GameState.wordOver = true;

  // Remplir la modale
  document.getElementById("modal-result-icon").textContent = won ? "🎉" : "😔";
  document.getElementById("modal-word").textContent = revealData.word;
  document.getElementById("modal-definition").textContent = revealData.definition;
  document.getElementById("modal-funfact").textContent = revealData.fun_fact;

  const scoreEl = document.getElementById("modal-score-earned");
  if (won) {
    scoreEl.textContent = `+${pointsEarned} points earned!`;
  } else {
    scoreEl.textContent = "No points this round — you'll get the next one!";
    scoreEl.style.color = "var(--text-muted)";
  }

  // Afficher la modale
  document.getElementById("modal-overlay").classList.add("visible");
}

/**
 * Passe au mot suivant ou déclenche le Game Over
 */
function nextWord() {
  // Fermer la modale éducative
  document.getElementById("modal-overlay").classList.remove("visible");

  if (GameState.gameOver) {
    // Afficher la modale Game Over
    document.getElementById("final-score").textContent = GameState.score;
    document.getElementById("gameover-overlay").classList.add("visible");
  } else {
    startNewWord();
  }
}

// ══════════════════════════════════════════════════════
// UTILITAIRES
// ══════════════════════════════════════════════════════

/**
 * Affiche un message de statut en haut de l'interface
 * @param {string} message - Texte à afficher
 * @param {string} type    - '' | 'error' | 'success' | 'info'
 */
function setStatus(message, type = "") {
  const el = document.getElementById("status-message");
  el.textContent = message;
  el.className = type;
}

// ══════════════════════════════════════════════════════
// LANCEMENT
// ══════════════════════════════════════════════════════

// Démarrer le jeu au chargement de la page
document.addEventListener("DOMContentLoaded", () => {
  restartGame();
});
