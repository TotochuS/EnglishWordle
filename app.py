"""
app.py - Backend Flask pour WordLearn — Wordle éducatif anglais
Gère les routes, la logique de jeu, les niveaux CECRL et le dictionnaire personnel
"""

import json
import random
from flask import Flask, render_template, request, jsonify, session

app = Flask(__name__)
app.secret_key = "wordlearn_secret_key_2024_v2"

LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]

def load_words():
    with open("data/words.json", "r", encoding="utf-8") as f:
        return json.load(f)

def get_words_by_length_and_level(words, length, level):
    return [w for w in words if len(w["word"]) == length and w["level"] == level]

def get_available_modes(words):
    """Retourne les combinaisons (longueur, niveau) disponibles avec le nombre de mots"""
    modes = {}
    for w in words:
        length = len(w["word"])
        level = w["level"]
        key = (length, level)
        modes[key] = modes.get(key, 0) + 1
    return modes

# ──────────────────────────────────────────────
# ROUTES PAGES
# ──────────────────────────────────────────────

@app.route("/")
def menu():
    """Page de menu principal"""
    return render_template("menu.html")

@app.route("/play")
def play():
    """Page de jeu"""
    return render_template("index.html")

@app.route("/dictionary")
def dictionary():
    """Page dictionnaire — mots déjà devinés"""
    return render_template("dictionary.html")

# ──────────────────────────────────────────────
# API
# ──────────────────────────────────────────────

@app.route("/api/menu-data", methods=["GET"])
def menu_data():
    """Retourne la structure des mots disponibles pour le menu"""
    words = load_words()
    modes = get_available_modes(words)

    # Grouper par longueur de mot
    by_length = {}
    for (length, level), count in modes.items():
        if length not in by_length:
            by_length[length] = {}
        by_length[length][level] = count

    return jsonify({"by_length": by_length, "level_order": LEVEL_ORDER})


@app.route("/api/new-word", methods=["GET"])
def new_word():
    """Sélectionne un nouveau mot selon la longueur et le niveau demandés"""
    length = request.args.get("length", type=int)
    level = request.args.get("level", "A1")

    words = load_words()

    if length:
        pool = get_words_by_length_and_level(words, length, level)
    else:
        pool = words

    if not pool:
        return jsonify({"error": "No words available for this configuration"}), 404

    # Éviter de redonner le même mot consécutivement
    last_word = session.get("current_word", "")
    if len(pool) > 1:
        pool = [w for w in pool if w["word"].upper() != last_word] or pool

    word_data = random.choice(pool)

    session["current_word"] = word_data["word"].upper()
    session["hint"] = word_data["hint"]
    session["definition"] = word_data["definition"]
    session["fun_fact"] = word_data["fun_fact"]
    session["word_level"] = word_data["level"]
    session["attempts"] = 0

    return jsonify({
        "word_length": len(word_data["word"]),
        "level": word_data["level"],
        "hint": word_data["hint"]
    })


@app.route("/api/guess", methods=["POST"])
def guess():
    """Vérifie une tentative du joueur"""
    data = request.get_json()
    guess_word = data.get("guess", "").upper().strip()
    current_word = session.get("current_word", "")

    if not guess_word or not current_word:
        return jsonify({"error": "Missing data"}), 400

    if len(guess_word) != len(current_word):
        return jsonify({"error": f"Word must be {len(current_word)} letters"}), 400

    result = ["absent"] * len(current_word)
    target_letters = list(current_word)
    guess_letters = list(guess_word)

    # 1ère passe : corrects (vert)
    for i in range(len(current_word)):
        if guess_letters[i] == target_letters[i]:
            result[i] = "correct"
            target_letters[i] = None
            guess_letters[i] = None

    # 2ème passe : présents (jaune)
    for i in range(len(current_word)):
        if guess_letters[i] is not None and guess_letters[i] in target_letters:
            result[i] = "present"
            target_letters[target_letters.index(guess_letters[i])] = None

    session["attempts"] = session.get("attempts", 0) + 1
    won = all(r == "correct" for r in result)

    response = {
        "result": result,
        "won": won,
        "attempts": session["attempts"]
    }

    if won or session["attempts"] >= 6:
        reveal_data = {
            "word": current_word,
            "definition": session.get("definition", ""),
            "fun_fact": session.get("fun_fact", ""),
            "level": session.get("word_level", "")
        }
        response["reveal"] = reveal_data

        # Ajouter au dictionnaire si gagné
        if won:
            dictionary = session.get("dictionary", [])
            already_saved = any(e["word"] == current_word for e in dictionary)
            if not already_saved:
                dictionary.append({
                    "word": current_word,
                    "definition": session.get("definition", ""),
                    "fun_fact": session.get("fun_fact", ""),
                    "level": session.get("word_level", "")
                })
                session["dictionary"] = dictionary
                session.modified = True

    return jsonify(response)


@app.route("/api/hint", methods=["GET"])
def get_hint():
    hint = session.get("hint", "No hint available.")
    return jsonify({"hint": hint})


@app.route("/api/dictionary", methods=["GET"])
def get_dictionary():
    """Retourne les mots déjà devinés par le joueur"""
    dictionary = session.get("dictionary", [])
    return jsonify({"words": dictionary})


@app.route("/api/dictionary/clear", methods=["POST"])
def clear_dictionary():
    """Efface le dictionnaire personnel"""
    session["dictionary"] = []
    session.modified = True
    return jsonify({"success": True})


# ──────────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=True)
