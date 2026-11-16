// Catalog of technologies shown in the "Tech stack" section.
// Logos are Simple Icons slugs (https://simpleicons.org); an unknown slug just
// renders the badge without a logo.

const T = (name, color, logo = null, logoColor = 'white') => ({ name, color, logo, logoColor });

export const LANGS = {
  javascript: T('JavaScript', 'F7DF1E', 'javascript', 'black'),
  typescript: T('TypeScript', '3178C6', 'typescript'),
  node: T('Node.js', '5FA04E', 'nodedotjs'),
  bun: T('Bun', '000000', 'bun'),
  python: T('Python', '3776AB', 'python'),
  rust: T('Rust', '000000', 'rust'),
  go: T('Go', '00ADD8', 'go'),
  php: T('PHP', '777BB4', 'php'),
  ruby: T('Ruby', 'CC342D', 'ruby'),
  java: T('Java', 'ED8B00', 'openjdk'),
  kotlin: T('Kotlin', '7F52FF', 'kotlin'),
  csharp: T('C#', '512BD4'),
  fsharp: T('F#', '378BBA', 'fsharp'),
  dotnet: T('.NET', '512BD4', 'dotnet'),
  maven: T('Apache Maven', 'C71A36', 'apachemaven'),
  gradle: T('Gradle', '02303A', 'gradle'),
  swift: T('Swift', 'F05138', 'swift'),
  ios: T('iOS', '000000', 'apple'),
  cocoapods: T('CocoaPods', 'EE3322', 'cocoapods'),
  dart: T('Dart', '0175C2', 'dart'),
  flutter: T('Flutter', '02569B', 'flutter'),
  elixir: T('Elixir', '4B275F', 'elixir'),
  cpp: T('C++', '00599C', 'cplusplus'),
  c: T('C', 'A8B9CC', 'c', 'black'),
  cmake: T('CMake', '064F8C', 'cmake'),
  meson: T('Meson', '3A2F7B'),
  vcpkg: T('vcpkg', '0078D4'),
  conan: T('Conan', '6699CB', 'conan'),
  docker: T('Docker', '2496ED', 'docker'),
  githubActions: T('GitHub Actions', '2088FF', 'githubactions'),
  turborepo: T('Turborepo', 'EF4444', 'turborepo'),
  nx: T('Nx', '143055', 'nx'),
  lerna: T('Lerna', '9333EA', 'lerna'),
};

// Matchers are dependency names. A matcher ending with "/", ":" or "." is a
// prefix (e.g. "@storybook/", "org.springframework.boot:"); any other matcher
// also matches "name/sub/path" (needed for Go module paths such as
// github.com/labstack/echo/v4).
export const NODE_TECH = [
  [['next'], T('Next.js', '000000', 'nextdotjs')],
  [['react', 'react-dom'], T('React', '20232A', 'react', '61DAFB')],
  [['react-native'], T('React Native', '20232A', 'react', '61DAFB')],
  [['expo'], T('Expo', '000020', 'expo')],
  [['nuxt'], T('Nuxt', '00DC82', 'nuxt', 'black')],
  [['vue'], T('Vue.js', '4FC08D', 'vuedotjs')],
  [['@sveltejs/kit'], T('SvelteKit', 'FF3E00', 'svelte')],
  [['svelte'], T('Svelte', 'FF3E00', 'svelte')],
  [['@angular/core'], T('Angular', '0F0F11', 'angular')],
  [['solid-js'], T('Solid', '2C4F7C', 'solid')],
  [['astro'], T('Astro', 'BC52EE', 'astro')],
  [['@remix-run/react', '@remix-run/node'], T('Remix', '000000', 'remix')],
  [['electron'], T('Electron', '47848F', 'electron')],
  [['@tauri-apps/api'], T('Tauri', '24C8D8', 'tauri')],
  [['@nestjs/core'], T('NestJS', 'E0234E', 'nestjs')],
  [['express'], T('Express', '000000', 'express')],
  [['fastify'], T('Fastify', '000000', 'fastify')],
  [['koa'], T('Koa', '33333D', 'koa')],
  [['hono'], T('Hono', 'E36002', 'hono')],
  [['graphql'], T('GraphQL', 'E10098', 'graphql')],
  [['socket.io'], T('Socket.IO', '010101', 'socketdotio')],
  [['prisma', '@prisma/client'], T('Prisma', '2D3748', 'prisma')],
  [['drizzle-orm'], T('Drizzle', 'C5F74F', 'drizzle', 'black')],
  [['mongoose', 'mongodb'], T('MongoDB', '47A248', 'mongodb')],
  [['pg', 'postgres'], T('PostgreSQL', '4169E1', 'postgresql')],
  [['mysql', 'mysql2'], T('MySQL', '4479A1', 'mysql')],
  [['redis', 'ioredis'], T('Redis', 'FF4438', 'redis')],
  [['sequelize'], T('Sequelize', '52B0E7', 'sequelize')],
  [['@reduxjs/toolkit', 'redux'], T('Redux', '764ABC', 'redux')],
  [['three'], T('Three.js', '000000', 'threedotjs')],
  [['tailwindcss'], T('Tailwind CSS', '06B6D4', 'tailwindcss')],
  [['sass'], T('Sass', 'CC6699', 'sass')],
  [['vite'], T('Vite', '646CFF', 'vite')],
  [['webpack'], T('Webpack', '8DD6F9', 'webpack', 'black')],
  [['jest'], T('Jest', 'C21325', 'jest')],
  [['vitest'], T('Vitest', '6E9F18', 'vitest')],
  [['mocha'], T('Mocha', '8D6748', 'mocha')],
  [['@playwright/test', 'playwright'], T('Playwright', '2EAD33')],
  [['cypress'], T('Cypress', '69D3A7', 'cypress', 'black')],
  [['storybook', '@storybook/'], T('Storybook', 'FF4785', 'storybook')],
];

export const PYTHON_TECH = [
  [['django'], T('Django', '092E20', 'django')],
  [['flask'], T('Flask', '000000', 'flask')],
  [['fastapi'], T('FastAPI', '009688', 'fastapi')],
  [['streamlit'], T('Streamlit', 'FF4B4B', 'streamlit')],
  [['sqlalchemy'], T('SQLAlchemy', 'D71F00', 'sqlalchemy')],
  [['pydantic'], T('Pydantic', 'E92063', 'pydantic')],
  [['celery'], T('Celery', '37814A', 'celery')],
  [['pandas'], T('pandas', '150458', 'pandas')],
  [['numpy'], T('NumPy', '013243', 'numpy')],
  [['scikit-learn'], T('scikit-learn', 'F7931E', 'scikitlearn')],
  [['torch'], T('PyTorch', 'EE4C2C', 'pytorch')],
  [['tensorflow'], T('TensorFlow', 'FF6F00', 'tensorflow')],
  [['jupyter', 'jupyterlab', 'notebook'], T('Jupyter', 'F37626', 'jupyter')],
  [['pytest'], T('pytest', '0A9EDC', 'pytest')],
];

export const RUST_TECH = [
  [['tauri'], T('Tauri', '24C8D8', 'tauri')],
  [['bevy'], T('Bevy', '232326', 'bevy')],
  [['actix-web'], T('Actix Web', '000000', 'actix')],
  [['axum'], T('Axum', '000000')],
  [['rocket'], T('Rocket', 'D33847')],
  [['tokio'], T('Tokio', '000000')],
  [['clap'], T('clap', '000000')],
];

export const GO_TECH = [
  [['github.com/gin-gonic/gin'], T('Gin', '008ECF', 'gin')],
  [['github.com/labstack/echo'], T('Echo', '000000')],
  [['github.com/gofiber/fiber'], T('Fiber', '00ACD7')],
  [['github.com/spf13/cobra'], T('Cobra', '00ADD8')],
  [['gorm.io/gorm'], T('GORM', '00ADD8')],
];

export const PHP_TECH = [
  [['laravel/framework'], T('Laravel', 'FF2D20', 'laravel')],
  [['symfony/framework-bundle'], T('Symfony', '000000', 'symfony')],
  [['slim/slim'], T('Slim', '719E40')],
  [['codeigniter4/framework'], T('CodeIgniter', 'EF4223', 'codeigniter')],
  [['livewire/livewire'], T('Livewire', '4E56A6', 'livewire')],
  [['filament/filament'], T('Filament', 'FDAE4B', null, 'black')],
  [['inertiajs/inertia-laravel'], T('Inertia', '9553E9', 'inertia')],
  [['doctrine/orm'], T('Doctrine', 'FC6A31', 'doctrine')],
  [['twig/twig'], T('Twig', 'BACF29', 'twig', 'black')],
  [['phpunit/phpunit'], T('PHPUnit', '3C9CD7')],
  [['pestphp/pest'], T('Pest', 'F472B6')],
];

export const RUBY_TECH = [
  [['rails'], T('Ruby on Rails', 'D30001', 'rubyonrails')],
  [['sinatra'], T('Sinatra', '000000')],
  [['hanami'], T('Hanami', 'C53A40')],
  [['jekyll'], T('Jekyll', 'CC0000', 'jekyll')],
  [['turbo-rails'], T('Hotwire', '000000')],
  [['sidekiq'], T('Sidekiq', 'B1003E')],
  [['pg'], T('PostgreSQL', '4169E1', 'postgresql')],
  [['redis'], T('Redis', 'FF4438', 'redis')],
  [['rspec', 'rspec-rails'], T('RSpec', 'CC342D')],
];

// Java dependencies are "group:artifact" coordinates.
export const JAVA_TECH = [
  [['org.springframework.boot:'], T('Spring Boot', '6DB33F', 'springboot')],
  [['io.quarkus:'], T('Quarkus', '4695EB', 'quarkus')],
  [['io.micronaut:', 'io.micronaut.'], T('Micronaut', '1A1A1A')],
  [['io.ktor:'], T('Ktor', '087CFA', 'ktor')],
  [['androidx.compose.', 'androidx.compose:'], T('Jetpack Compose', '4285F4', 'jetpackcompose')],
  [['org.hibernate:', 'org.hibernate.orm:'], T('Hibernate', '59666C', 'hibernate')],
  [['org.postgresql:'], T('PostgreSQL', '4169E1', 'postgresql')],
  [['com.mysql:', 'mysql:'], T('MySQL', '4479A1', 'mysql')],
  [['org.junit.jupiter:', 'org.junit:'], T('JUnit 5', '25A162', 'junit5')],
];

// NuGet package ids, lower-cased.
export const DOTNET_TECH = [
  [['microsoft.entityframeworkcore', 'microsoft.entityframeworkcore.'], T('Entity Framework Core', '512BD4')],
  [['microsoft.aspnetcore.components.webassembly'], T('Blazor', '512BD4', 'blazor')],
  [['avalonia'], T('Avalonia', '8B44AC')],
  [['swashbuckle.aspnetcore'], T('Swagger', '85EA2D', 'swagger', 'black')],
  [['xunit'], T('xUnit', '512BD4')],
  [['nunit'], T('NUnit', '22B14C')],
  [['mstest.testframework', 'mstest'], T('MSTest', '512BD4')],
];

// Swift packages are "owner/repo" from their GitHub URL, CocoaPods are pod
// names ("firebase/analytics"), all lower-cased.
export const SWIFT_TECH = [
  [['vapor/vapor'], T('Vapor', '0D0D0D', 'vapor')],
  [['hummingbird-project/hummingbird'], T('Hummingbird', 'F05138')],
  [['alamofire/alamofire', 'alamofire'], T('Alamofire', 'F05138')],
  [['pointfreeco/swift-composable-architecture'], T('Composable Architecture', '000000')],
  [['realm/realm-swift', 'realmswift'], T('Realm', '39477F', 'realm')],
  [['firebase/firebase-ios-sdk', 'firebase'], T('Firebase', 'FFCA28', 'firebase', 'black')],
  [['apple/swift-argument-parser'], T('Swift Argument Parser', 'F05138', 'swift')],
];

export const DART_TECH = [
  [['firebase_core'], T('Firebase', 'FFCA28', 'firebase', 'black')],
  [['supabase_flutter', 'supabase'], T('Supabase', '3FCF8E', 'supabase', 'black')],
  [['flutter_riverpod', 'hooks_riverpod', 'riverpod'], T('Riverpod', '0553B1')],
  [['flutter_bloc', 'bloc'], T('Bloc', '00B4FF')],
  [['provider'], T('Provider', '02569B')],
  [['get'], T('GetX', '8A2BE2')],
  [['dart_frog'], T('Dart Frog', '0175C2', 'dart')],
  [['shelf'], T('Shelf', '0175C2', 'dart')],
];

export const ELIXIR_TECH = [
  [['phoenix'], T('Phoenix', 'FD4F00', 'phoenixframework')],
  [['phoenix_live_view'], T('Phoenix LiveView', 'FD4F00', 'phoenixframework')],
  [['ecto', 'ecto_sql'], T('Ecto', '4B275F')],
  [['postgrex'], T('PostgreSQL', '4169E1', 'postgresql')],
  [['oban'], T('Oban', '4B275F')],
  [['absinthe'], T('GraphQL', 'E10098', 'graphql')],
  [['nerves'], T('Nerves', '4B275F')],
  [['tailwind'], T('Tailwind CSS', '06B6D4', 'tailwindcss')],
];

// CMake find_package() names and vcpkg / Conan packages, lower-cased.
export const CPP_TECH = [
  [['qt5', 'qt6', 'qt', 'qtbase'], T('Qt', '41CD52', 'qt')],
  [['boost', 'boost-'], T('Boost', 'F7901E')],
  [['opencv', 'opencv4'], T('OpenCV', '5C3EE8', 'opencv')],
  [['sdl2', 'sdl3', 'sdl'], T('SDL', '1D4979')],
  [['sfml'], T('SFML', '8CC445', 'sfml')],
  [['raylib'], T('raylib', '000000')],
  [['imgui'], T('Dear ImGui', '1E1E1E')],
  [['opengl', 'glfw3', 'glfw', 'glad'], T('OpenGL', '5586A4', 'opengl')],
  [['vulkan'], T('Vulkan', 'AC162C', 'vulkan')],
  [['gtest', 'googletest'], T('GoogleTest', '4285F4', 'google')],
  [['catch2'], T('Catch2', '000000')],
];

const PREFIX = /[/:.-]$/;
const matches = (dep, matcher) => dep === matcher || dep.startsWith(PREFIX.test(matcher) ? matcher : `${matcher}/`);

/** Returns the catalog entries whose matchers hit one of `deps`, in catalog order. */
export function techFromDeps(catalog, deps) {
  const list = [...deps];
  return catalog
    .filter(([matchers]) => matchers.some((m) => list.some((d) => matches(d, m))))
    .map(([, tech]) => tech);
}
