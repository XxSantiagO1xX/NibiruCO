const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "../..");
const backendSrc = path.join(root, "backend", "src");
const frontendDir = path.join(root, "frontend");
const mobileDir = path.join(root, "nibiru-mobile");

function walk(dir, predicate) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, predicate));
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function checkNodeSyntax(file) {
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
}

function resolveLocalAsset(htmlFile, ref) {
  const clean = ref.split("#")[0].split("?")[0];
  if (!clean || clean.startsWith("http://") || clean.startsWith("https://") || clean.startsWith("//") || clean.startsWith("data:") || clean.startsWith("javascript:") || clean.includes("${") || clean.includes("`")) {
    return null;
  }

  if (clean.startsWith("/css/")) return path.join(root, clean.slice(1));
  if (clean.startsWith("/")) return path.join(frontendDir, clean.slice(1));
  return path.resolve(path.dirname(htmlFile), clean);
}

function checkHtml(file) {
  const html = fs.readFileSync(file, "utf8");
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(html))) {
    const attrs = match[1] || "";
    const code = match[2] || "";
    if (/\bsrc\s*=/.test(attrs) || !code.trim()) continue;
    new vm.Script(code, { filename: `${path.basename(file)}:inline-script` });
  }

  const refRegex = /\b(?:href|src)=["']([^"']+)["']/gi;
  while ((match = refRegex.exec(html))) {
    const target = resolveLocalAsset(file, match[1]);
    if (!target) continue;
    assert(fs.existsSync(target), `${path.relative(root, file)} referencia un archivo inexistente: ${match[1]}`);
  }
}

const requiredScreens = [
  "login.html",
  "register.html",
  "home.html",
  "index.html",
  "waiter.html",
  "kds.html",
  "counter.html",
  "menu.html",
  "products.html",
  "tables.html",
  "combos.html"
];

for (const screen of requiredScreens) {
  assert(fs.existsSync(path.join(frontendDir, screen)), `Falta pantalla web requerida: ${screen}`);
}

const appJs = fs.readFileSync(path.join(frontendDir, "app.js"), "utf8");
for (const screen of requiredScreens.filter((name) => !["login.html", "register.html", "home.html"].includes(name))) {
  assert(appJs.includes(`'${screen}'`) || appJs.includes(`"${screen}"`), `app.js no registra ${screen} en la navegación/permisos`);
}
assert(appJs.includes("/css/theme.css"), "app.js no aplica la capa visual SaaS theme.css");
assert(appJs.includes("assets/icons.svg"), "app.js no aplica la iconografía SVG de MealOps");

const homeHtml = fs.readFileSync(path.join(frontendDir, "home.html"), "utf8");
for (const screen of ["index.html", "waiter.html", "kds.html", "counter.html", "menu.html", "products.html", "tables.html", "combos.html"]) {
  assert(homeHtml.includes(screen), `El panel principal no enlaza ${screen}`);
}

for (const file of walk(backendSrc, (f) => f.endsWith(".js"))) checkNodeSyntax(file);
checkNodeSyntax(path.join(frontendDir, "app.js"));
for (const file of walk(frontendDir, (f) => f.endsWith(".html"))) checkHtml(file);

const schemaSql = fs.readFileSync(
  path.join(root, "backend", "sql", "2026-09-04-mealops-operational.sql"),
  "utf8"
);
const expectedObjects = [
  "restaurant_tables",
  "table_sessions",
  "daily_folio_counters",
  "table_payments",
  "combo_groups",
  "combo_group_options",
  "order_item_combo_choices",
  "kitchen_required",
  "product_kind",
  "table_session_id",
  "service_type",
  "customer_name",
  "pickup_at",
  "folio",
  "service_date",
  "payment_status",
  "paid_at"
];
for (const object of expectedObjects) {
  assert(schemaSql.includes(object), `El esquema PostgreSQL no contiene ${object}`);
}

const requiredMigrationFragments = [
  "pg_advisory_xact_lock",
  "ALTER COLUMN payment_method DROP NOT NULL",
  "ALTER COLUMN payment_method DROP DEFAULT",
  "orders_service_type_mealops_check",
  "orders_payment_method_mealops_check",
  "daily_folio_counters_last_folio_nonnegative",
  "combo_groups_selection_bounds",
  "combo_group_options_extra_price_nonnegative",
  "order_item_combo_choices_extra_price_nonnegative",
  "WHEN 'pickup' THEN 'llevar'",
  "WHEN 'delivery' THEN 'domicilio'",
  "WHEN 'cash' THEN 'efectivo'",
  "WHEN 'card' THEN 'tarjeta'"
];
for (const fragment of requiredMigrationFragments) {
  assert(schemaSql.includes(fragment), `La migración PostgreSQL no cubre: ${fragment}`);
}

const mobilePackage = JSON.parse(
  fs.readFileSync(path.join(mobileDir, "package.json"), "utf8")
);
for (const dependency of ["@expo/vector-icons", "expo-font", "react-native-gesture-handler"]) {
  assert(
    mobilePackage.dependencies?.[dependency],
    `nibiru-mobile debe declarar directamente ${dependency}`
  );
}

const addressesScreen = fs.readFileSync(
  path.join(mobileDir, "screens", "AddressesScreen.js"),
  "utf8"
);
assert(
  addressesScreen.includes("../config/api"),
  "AddressesScreen debe usar la configuración central de API"
);
assert(
  !addressesScreen.includes("192.168."),
  "AddressesScreen no debe fijar una IP privada"
);

const mobileApp = fs.readFileSync(path.join(mobileDir, "App.js"), "utf8");
assert(
  mobileApp.includes('name="Addresses"') || mobileApp.includes("name='Addresses'"),
  "La app móvil no registra la pantalla de direcciones"
);

console.log("MealOps smoke estático: OK");
