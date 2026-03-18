"""
app.py - Backend Flask pour le jeu Wordle éducatif anglais
Gère les routes, la logique de jeu et la vérification des tentatives
"""

import json
import random
from flask import Flask, render_template, request, jsonify, session

app = Flask(__name__)
app.secret_key = "wordle_english_secret_key_2024"  # Clé secrète pour les sessions

# Chargement des mots depuis le fichier JSON
def load_words():
    """Charge la liste des mots depuis data/words.json"""
    with open("data/words.json", "r", encoding="utf-8") as f:
        return json.load(f)

# ──────────────────────────────────────────────
# ROUTES
# ──────────────────────────────────────────────

@app.route("/")
def index():
    """Page principale du jeu"""
    return render_template("index.html")


@app.route("/api/new-word", methods=["GET"])
def new_word():
    """
    Sélectionne un nouveau mot aléatoire et l'enregistre en session.
    Retourne la longueur du mot et l'indice (hint), mais PAS le mot lui-même.
    """
    words = load_words()
    word_data = random.choice(words)

    # Sauvegarde le mot courant en session (côté serveur uniquement)
    session["current_word"] = word_data["word"].upper()
    session["hint"] = word_data["hint"]
    session["definition"] = word_data["definition"]
    session["fun_fact"] = word_data["fun_fact"]
    session["attempts"] = 0

    return jsonify({
        "word_length": len(word_data["word"]),
        "hint": word_data["hint"]
    })


@app.route("/api/guess", methods=["POST"])
def guess():
    """
    Reçoit une tentative du joueur et retourne le résultat lettre par lettre.
    Résultats possibles : 'correct', 'present', 'absent'
    """
    data = request.get_json()
    guess_word = data.get("guess", "").upper().strip()
    current_word = session.get("current_word", "")

    if not guess_word or not current_word:
        return jsonify({"error": "Données manquantes"}), 400

    if len(guess_word) != len(current_word):
        return jsonify({"error": f"Le mot doit contenir {len(current_word)} lettres"}), 400

    # ── Algorithme de comparaison (gère les doublons correctement) ──
    result = ["absent"] * len(current_word)
    target_letters = list(current_word)
    guess_letters = list(guess_word)

    # 1ère passe : lettres correctes (vert)
    for i in range(len(current_word)):
        if guess_letters[i] == target_letters[i]:
            result[i] = "correct"
            target_letters[i] = None  # Marque comme utilisée
            guess_letters[i] = None

    # 2ème passe : lettres présentes (jaune)
    for i in range(len(current_word)):
        if guess_letters[i] is not None and guess_letters[i] in target_letters:
            result[i] = "present"
            target_letters[target_letters.index(guess_letters[i])] = None

    # Incrémente le compteur de tentatives
    session["attempts"] = session.get("attempts", 0) + 1
    won = all(r == "correct" for r in result)

    response = {
        "result": result,
        "won": won,
        "attempts": session["attempts"]
    }

    # Si gagné ou 6 tentatives épuisées, on révèle les infos éducatives
    if won or session["attempts"] >= 6:
        response["reveal"] = {
            "word": current_word,
            "definition": session.get("definition", ""),
            "fun_fact": session.get("fun_fact", "")
        }

    return jsonify(response)


@app.route("/api/hint", methods=["GET"])
def get_hint():
    """Retourne l'indice du mot courant (gratuit, sans pénalité)"""
    hint = session.get("hint", "Aucun indice disponible.")
    return jsonify({"hint": hint})


# ──────────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=True)
