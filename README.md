<div align="center">

# readme-start

Générez un `README.md` complet et soigné à partir des fichiers de votre projet, puis régénérez-le sans perdre ce que vous avez écrit.
Zéro configuration, zéro dépendance.

**[Site web](https://ernestjesutinafaton-maker.github.io/readme-start/)**

[![npm version](https://img.shields.io/npm/v/readme-start)](https://www.npmjs.com/package/readme-start)
[![npm downloads](https://img.shields.io/npm/dm/readme-start)](https://www.npmjs.com/package/readme-start)
![license](https://img.shields.io/badge/license-MIT-green)
![node](https://img.shields.io/badge/node-%3E%3D20-5FA04E?logo=nodedotjs&logoColor=white)
![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

</div>

```bash
cd mon-projet
npx readme-start
```

`readme-start` lit vos manifestes (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `composer.json`, `Gemfile`, `pom.xml`, `build.gradle`, `*.sln`, `pubspec.yaml`, `Package.swift`, `mix.exs`, `CMakeLists.txt`…), votre `Dockerfile`, `.env.example`, `LICENSE`, `.git/config`… et en tire un README prêt à publier : description, badges, technologies, prérequis, installation, utilisation, paquets du monorepo, variables d'environnement, scripts, tests, Docker, arborescence, contribution, licence et auteur.

## Fonctionnalités

- **12 écosystèmes** :
  - Node.js (npm, Yarn, pnpm, Bun), Python (pip, Poetry, uv, Pipenv), Rust, Go ;
  - PHP (Composer, Laravel, Symfony), Ruby (Bundler, Rails, Jekyll, gems) ;
  - Java et Kotlin (Maven, Gradle, Spring Boot, Quarkus, Android), .NET (solutions, ASP.NET Core, outils `dotnet tool`) ;
  - Dart et Flutter, Swift (SwiftPM, Xcode, CocoaPods, Vapor), Elixir (Mix, Phoenix, Hex) ;
  - C et C++ (CMake avec presets, vcpkg ou Conan, Meson, Makefile).
- **Monorepos** : workspaces npm/Yarn/pnpm/Bun, Lerna, Turborepo, Nx, workspace Cargo, `go.work`, workspace uv, modules Maven, projets Gradle, solutions .NET, Melos et workspaces pub, projets umbrella Elixir. Une section liste les paquets avec leur description, et le stack technique agrège celui de chaque paquet.
- **Commandes exactes** : `pnpm dev`, `uv run pytest`, `php artisan serve`, `./mvnw spring-boot:run`, `dotnet run --project src/Api`, `flutter run`, `mix phx.server`, `cmake --preset release`… selon les outils détectés.
- **Régénération sans perte** : vos sections, vos modifications et vos blocs protégés sont conservés (voir plus bas).
- **Badges automatiques** : version npm, PyPI, crates.io, Packagist, RubyGems, Maven Central, NuGet, pub.dev ou Hex quand le paquet est publiable, statut CI GitHub Actions, licence, version du runtime, badges des technologies.
- **Variables d'environnement** documentées depuis `.env.example`. Les valeurs des clés sensibles (`SECRET`, `TOKEN`, `PASSWORD`…) ne sont jamais recopiées.
- **Arborescence** qui respecte le `.gitignore` racine, les `.gitignore` imbriqués et `.git/info/exclude`.
- **Anglais ou français** (`--lang fr`).
- **Sans risque** : rien n'est envoyé sur le réseau, et les identifiants contenus dans une URL de remote git sont supprimés.

## Installation

Une fois publié sur npm :

```bash
npm install -g readme-start
```

Depuis les sources :

```bash
git clone https://github.com/ernestjesutinafaton-maker/readme-start.git
cd readme-start
npm link
```

Node.js 20 ou plus récent est requis.

## Utilisation

```bash
readme-start                          # README.md du dossier courant
readme-start ../mon-api --lang fr     # README en français pour un autre projet
readme-start --stdout > apercu.md     # aperçu sans toucher au README existant
readme-start -o docs/README.md        # écrire ailleurs
```

Si aucune description n'est trouvée (manifeste ou README existant), l'outil vous la demande en une phrase. Avec `-y`, il laisse un texte à compléter.

### Options

| Option | Description |
| --- | --- |
| `-o, --output <fichier>` | Écrit dans `<fichier>` au lieu de `<dossier>/README.md` |
| `--stdout` | Affiche le README au lieu d'écrire un fichier |
| `-f, --force` | Remplace un README écrit à la main sans demander |
| `--reset` | Régénère aussi les sections que vous avez modifiées |
| `-l, --lang <code>` | Langue du README : `en` (par défaut) ou `fr` |
| `-y, --yes` | Ne pose aucune question |
| `--depth <n>` | Niveaux affichés dans l'arborescence (2 par défaut, 0 pour la masquer) |
| `--no-badges` | Sans badges |
| `--no-toc` | Sans sommaire |
| `--no-tree` | Sans arborescence |
| `--no-emoji` | Sans emojis dans les titres |

Codes de sortie : `0` succès, `1` erreur (dossier introuvable, README écrit à la main sans `--force`), `2` option invalide.

## Régénérer sans perdre votre contenu

Relancez `readme-start` autant de fois que vous voulez : il met à jour les sections qu'il a générées (nouvelles dépendances, nouveaux scripts, nouvelle version de Node…) et **conserve** :

1. **Vos sections.** Tout titre `## …` que `readme-start` ne génère pas (« Fonctionnalités », « Captures d'écran », « FAQ »…) reste à sa place et apparaît dans le sommaire.
2. **Les sections générées que vous avez modifiées.** Une empreinte de chaque section est stockée dans un commentaire invisible en bas du fichier : si vous retouchez « Utilisation », votre version est gardée. `--reset` la remplace par une version fraîche.
3. **Les blocs protégés**, n'importe où dans le fichier :

   ```md
   <!-- readme-start:keep -->
   > Les tests e2e nécessitent `npx playwright install`.
   <!-- readme-start:end -->
   ```

   Un bloc placé dans une section générée revient exactement entre les mêmes paragraphes, même si le reste de la section est régénéré. Si ces paragraphes ont changé, il se place à la fin de la section. Cela vaut aussi pour l'en-tête : une capture d'écran placée sous la description reste dans le bloc centré. S'il contient un titre `## …` que `readme-start` génère, votre bloc remplace cette section. S'il contient un titre `# …`, il remplace le titre et la description.

Le contenu conservé est rattaché à la section générée qui le précède. Si celle-ci disparaît (par exemple « Docker » quand vous supprimez le `Dockerfile`), il se place après la section précédente.

**README écrit à la main.** À la première exécution, `readme-start` reconnaît les sections standard même sous d'autres noms (« Getting started », « Install », « Licence »…) et les remplace. Il garde les autres sections et les blocs protégés. Avant d'écrire, il affiche la liste de ce qui sera remplacé et conservé, et demande confirmation (ou `--force`).

## Ce qui est détecté

| Source | Informations utilisées |
| --- | --- |
| `package.json`, `pnpm-workspace.yaml`, `lerna.json`, `turbo.json`, `nx.json` | métadonnées, `engines`, `bin`, scripts, dépendances, gestionnaire de paquets, workspaces |
| `pyproject.toml`, `requirements.txt`, `setup.py`, `Pipfile` | PEP 621, Poetry, uv (et ses workspaces), `requires-python`, Django / FastAPI / Flask / Streamlit, pytest |
| `Cargo.toml` | métadonnées, `rust-version`, binaires ou bibliothèque, workspace |
| `go.mod`, `go.work` | module, version de Go, dépendances, `main.go` ou `cmd/*`, workspace |
| `composer.json` | métadonnées, version de PHP, scripts, Laravel (`artisan`), Symfony, Pest / PHPUnit |
| `Gemfile`, `*.gemspec`, `.ruby-version`, `lib/**/version.rb` | gems, version (y compris `Foo::VERSION`), descriptions en heredoc, Ruby, Rails, Jekyll, Sinatra, exécutables, RSpec |
| `pom.xml`, `build.gradle(.kts)`, `settings.gradle(.kts)`, `gradle/libs.versions.toml` | coordonnées Maven, version du JDK, wrappers `mvnw` / `gradlew`, Spring Boot, Quarkus, Android, modules (y compris `projectDir` personnalisés) |
| `*.sln`, `*.slnx`, `*.csproj`, `*.fsproj`, `global.json` | projets de la solution, framework cible, ASP.NET Core, outils, tests, NuGet |
| `pubspec.yaml`, `melos.yaml` | Dart ou Flutter, plateformes (`android/`, `ios/`, `web/`…), exécutables, Riverpod / Bloc / Firebase, workspaces |
| `Package.swift`, `*.xcodeproj`, `*.xcworkspace`, `Podfile` | produits SwiftPM, plateformes, Vapor, app Xcode, CocoaPods |
| `mix.exs` | application, version (y compris `@version`), Phoenix, Ecto, escript, paquet Hex, umbrella |
| `CMakeLists.txt` (et ceux des `add_subdirectory`), `CMakePresets.json`, `vcpkg.json`, `conanfile.*`, `meson.build` | cibles, standard C/C++, presets, gestionnaire de paquets, Qt / Boost / SDL / OpenCV…, tests CTest |
| tags git | dernière version pour les extraits SwiftPM et CMake `FetchContent` |
| `.git/config` | URL du dépôt (identifiants supprimés) |
| `LICENSE` | type de licence reconnu à partir du texte |
| `.github/workflows/*.yml` | badge de statut CI |
| `Dockerfile`, `compose.yaml` | commandes Docker, port `EXPOSE` |
| `.env.example` | tableau des variables d'environnement |
| `Makefile` | cibles, avec les commentaires `## description` |
| `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` | liens dans la section Contribuer |
| `README.md` existant | description, sections et blocs à conserver |

## Utilisation en tant que bibliothèque

```js
import { readFileSync } from 'node:fs';
import { analyzeProject, generateReadme } from 'readme-start';

const info = analyzeProject('./mon-projet');
const { markdown, merge } = generateReadme(info, {
  lang: 'fr',
  existing: readFileSync('./mon-projet/README.md', 'utf8'), // optionnel : conserve votre contenu
});
```

`analyzeProject` renvoie un objet de données simple, que vous pouvez modifier avant de le passer à `generateReadme`. `merge` décrit ce qui a été conservé.

## Développement

```bash
npm test            # tests (node:test, aucune dépendance)
npm start -- --help # lancer le CLI local
```

```text
src/
├── analyze/            # lecture du projet
│   ├── ecosystems/     # un détecteur par écosystème (node, python, rust, go, php, ruby, java, dotnet, dart, swift, elixir, cpp)
│   ├── common.js       # licence, git, CI, Docker, .env, Makefile…
│   ├── workspaces.js   # paquets des monorepos
│   ├── tech.js         # catalogue des technologies et de leurs badges
│   └── tree.js         # arborescence
├── generate/
│   ├── readme.js       # rendu Markdown
│   ├── merge.js        # conservation du contenu existant
│   └── i18n.js         # traductions
├── lib/                # parseurs TOML, XML et YAML, .gitignore, URLs de dépôt, badges
└── cli.js
```

Pour ajouter un écosystème, créez un détecteur dans `src/analyze/ecosystems/` qui renvoie le même format de données que les autres, puis ajoutez-le à `DETECTORS` dans [src/analyze/index.js](src/analyze/index.js).

### Site web

La page de présentation est [docs/index.html](docs/index.html) : un seul fichier HTML, sans dépendance, en français et en anglais (`?lang=en`). Pour la publier, ouvrez **Settings → Pages** sur GitHub, choisissez la branche `main` et le dossier `/docs`. Les liens vers le dépôt se déduisent de l'adresse `https://<utilisateur>.github.io/<dépôt>/`. Pour un domaine personnalisé, renseignez la balise `<meta name="repository">` en haut du fichier.

## Licence

Distribué sous licence **MIT**. Voir [`LICENSE`](LICENSE).
