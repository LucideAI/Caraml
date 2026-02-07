# Caraml

IDE OCaml web complet (frontend React + backend Express) avec execution de code, visualisation memoire, partage de projets et integration Learn OCaml.

## Sommaire

- [Fonctionnalites](#fonctionnalites)
- [Stack technique](#stack-technique)
- [Prerequis](#prerequis)
- [Installation](#installation)
- [Lancer le projet](#lancer-le-projet)
- [Variables d'environnement](#variables-denvironnement)
- [Structure du projet](#structure-du-projet)
- [API principale](#api-principale)
- [Raccourcis clavier](#raccourcis-clavier)
- [Notes importantes](#notes-importantes)

## Fonctionnalites

- Authentification utilisateur (inscription/connexion) avec JWT.
- Gestion de projets OCaml multi-fichiers (creation, edition, suppression).
- IDE Monaco (coloration, snippets, auto-completion, hover de types).
- Execution OCaml:
  - Mode backend reel via `ocaml` (si disponible).
  - Fallback sur un interpreteur OCaml embarque dans le navigateur.
- Integration optionnelle:
  - `ocamlmerlin` pour completion/types/erreurs.
  - `ocamlformat` pour formatage.
- Visualisation memoire (environnement, pile, heap, types).
- Partage public de projets via lien + fork des projets partages.
- Integration Learn OCaml (connexion, liste d'exercices, sync des reponses, affichage des notes).

## Stack technique

### Frontend

- React 18 + TypeScript
- Vite 5
- Zustand (state management)
- Monaco Editor
- Tailwind CSS
- React Router

### Backend

- Node.js + Express
- SQLite (`better-sqlite3`)
- JWT (`jsonwebtoken`)
- Hash de mot de passe (`bcryptjs`)

## Prerequis

- Node.js 18+ recommande.
- npm
- Optionnel (pour experience OCaml complete):
  - `ocaml`
  - `ocamlmerlin`
  - `ocamlformat`
  - `opam`

Important: la detection des outils OCaml cote serveur est cross-platform (Windows, macOS, Linux). Si les outils ne sont pas installes, l'application reste utilisable sans erreur systeme.

## Installation

Depuis `Caraml/`:

```bash
npm install
```

### Installation facilitee de la toolchain OCaml (optionnelle)

On ne versionne pas les binaires `ocaml` / `ocamlmerlin` / `ocamlformat` dans Git (taille, portabilite, maintenance).
A la place, le projet fournit un script d'installation reproductible via `opam`:

Windows (installation opam + git):

```powershell
winget install Git.Git OCaml.opam
```

```bash
npm run setup:ocaml
```

Le script cree (ou reutilise) un switch local `./_opam` et installe:

- `ocaml-base-compiler.5.4.0`
- `merlin.5.6.1-504`
- `ocamlformat.0.28.1`

Si `opam` est present mais pas initialise, le script execute automatiquement `opam init` (sur Windows avec `--cygwin-internal-install` pour eviter la question interactive).
Pendant les etapes longues (compilation OCaml), le script affiche un heartbeat periodique `still running (...)` pour indiquer que l'installation continue.

Ensuite, `npm run dev` detecte automatiquement ces outils.
`npm run dev` lance aussi un auto-bootstrap (`ensure:ocaml`) au demarrage:

- si la toolchain est absente et `opam` disponible, il lance automatiquement `setup:ocaml`;
- sur Windows, si `opam` est absent, il tente une installation via `winget`, puis via le script officiel opam (best-effort);
- en cas d'echec, l'application demarre en mode fallback navigateur.

Pour desactiver l'auto-bootstrap:

```bash
CARAML_SKIP_OCAML_AUTO_SETUP=1 npm run dev
```

PowerShell:

```powershell
$env:CARAML_SKIP_OCAML_AUTO_SETUP="1"; npm run dev
```

Si `opam` n'est pas encore installe: https://opam.ocaml.org/doc/Install.html

## Lancer le projet

### Developpement (frontend + backend)

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- API backend: `http://localhost:3001`
- Le frontend proxy automatiquement `/api` vers le backend.
- Si `ocaml`, `ocamlmerlin` ou `ocamlformat` ne sont pas disponibles, le serveur bascule proprement en mode degrade (fallback navigateur + fonctions optionnelles desactivees).

### Lancer seulement le frontend

```bash
npm run dev:client
```

### Lancer seulement le backend

```bash
npm run dev:server
```

### Build production

```bash
npm run build
```

### Demarrage "production"

```bash
npm run start
```

Note: `npm run start` sert `dist/` via Express. Pensez a lancer `npm run build` avant.

## Variables d'environnement

- `JWT_SECRET` (optionnelle, mais fortement recommandee en non-local)
- `CARAML_OCAML_PATH` (optionnelle): chemin explicite vers le binaire `ocaml`
- `CARAML_OCAMLMERLIN_PATH` (optionnelle): chemin explicite vers le binaire `ocamlmerlin`
- `CARAML_OCAMLFORMAT_PATH` (optionnelle): chemin explicite vers le binaire `ocamlformat`

Exemple Bash:

```bash
JWT_SECRET="change-me" \
CARAML_OCAML_PATH="/usr/local/bin/ocaml" \
CARAML_OCAMLMERLIN_PATH="/usr/local/bin/ocamlmerlin" \
CARAML_OCAMLFORMAT_PATH="/usr/local/bin/ocamlformat" \
npm run dev:server
```

PowerShell:

```powershell
$env:JWT_SECRET="change-me"
$env:CARAML_OCAML_PATH="C:\\Tools\\OCaml\\bin\\ocaml.exe"
$env:CARAML_OCAMLMERLIN_PATH="C:\\Tools\\OCaml\\bin\\ocamlmerlin.exe"
$env:CARAML_OCAMLFORMAT_PATH="C:\\Tools\\OCaml\\bin\\ocamlformat.exe"
npm run dev:server
```

Remarque: le port backend est fixe dans `server.js` (`3001`).

## Structure du projet

```text
Caraml/
|-- src/
|   |-- components/       # UI (header, editeur, console, modales...)
|   |-- pages/            # Dashboard, IDE, Share, Learn OCaml
|   |-- services/         # Clients API frontend
|   |-- store/            # Store global Zustand
|   `-- interpreter/      # Interpreteur OCaml navigateur (fallback)
|-- server.js             # API Express + SQLite + outils OCaml
|-- package.json
|-- tailwind.config.js
`-- vite.config.ts
```

Base de donnees locale SQLite:

- `caraml.db`
- `caraml.db-shm`
- `caraml.db-wal`

## API principale

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Projets

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PUT /api/projects/:id`
- `DELETE /api/projects/:id`

### Partage

- `POST /api/projects/:id/share`
- `POST /api/projects/:id/unshare`
- `GET /api/shared/:shareId`
- `POST /api/shared/:shareId/fork`

### OCaml tooling

- `GET /api/capabilities`
- `POST /api/execute`
- `POST /api/toplevel`
- `POST /api/format`
- `POST /api/merlin/complete`
- `POST /api/merlin/type`
- `POST /api/merlin/errors`

### Learn OCaml

- `POST /api/learn-ocaml/connect`
- `POST /api/learn-ocaml/exercises`
- `POST /api/learn-ocaml/exercise/*`
- `POST /api/learn-ocaml/save`
- `POST /api/learn-ocaml/sync-answer`
- `POST /api/learn-ocaml/grade`

## Raccourcis clavier

### IDE principal

- `Ctrl+Enter`: run
- `Ctrl+S`: save
- `Ctrl+Shift+F`: format (si `ocamlformat` dispo)

### Page Learn OCaml

- `Ctrl+Enter`: run
- `Ctrl+S`: sync
- `Ctrl+Shift+G`: grade

## Notes importantes

- Si `ocaml` n'est pas detecte, l'application reste utilisable via l'interpreteur navigateur (fallback), sans erreur systeme parasite.
- Si `ocamlmerlin` n'est pas detecte, la completion locale Monaco reste disponible.
- Si `ocamlformat` n'est pas detecte, le bouton Format est desactive.
- En l'etat, le secret JWT par defaut dans `server.js` doit etre remplace pour un usage reel.

