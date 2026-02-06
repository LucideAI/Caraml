# CamelCode

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

Important: la detection des outils OCaml cote serveur utilise `which` + `opam env`. Le setup est donc surtout prevu pour Linux/macOS ou WSL.

## Installation

Depuis `Caraml/`:

```bash
npm install
```

## Lancer le projet

### Developpement (frontend + backend)

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- API backend: `http://localhost:3001`
- Le frontend proxy automatiquement `/api` vers le backend.

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

Exemple:

```bash
JWT_SECRET="change-me" npm run dev:server
```

PowerShell:

```powershell
$env:JWT_SECRET="change-me"; npm run dev:server
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

- `camelcode.db`
- `camelcode.db-shm`
- `camelcode.db-wal`

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

- Si `ocaml` n'est pas detecte, l'application reste utilisable via l'interpreteur navigateur (fallback).
- Si `ocamlmerlin` n'est pas detecte, la completion locale Monaco reste disponible.
- Si `ocamlformat` n'est pas detecte, le bouton Format est desactive.
- En l'etat, le secret JWT par defaut dans `server.js` doit etre remplace pour un usage reel.

