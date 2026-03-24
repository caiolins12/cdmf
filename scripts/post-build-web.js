const fs = require("node:fs");
const path = require("node:path");

const distPath = path.join(__dirname, "..", "dist");
const indexPath = path.join(distPath, "index.html");
const metadataPath = path.join(distPath, "metadata.json");
const packageJsonPath = path.join(__dirname, "..", "package.json");

function readPackageVersion() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return packageJson.version || "1.0.0";
  } catch {
    return "1.0.0";
  }
}

function writeMetadata() {
  const metadata = {
    version: readPackageVersion(),
    buildTime: Date.now(),
  };

  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`metadata.json gerado (v${metadata.version})`);
}

function ensureServiceWorkerCleanupScript() {
  if (!fs.existsSync(indexPath)) {
    return;
  }

  const cleanupScript = `
  <script>
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
    }
  </script>`;

  let html = fs.readFileSync(indexPath, "utf8");
  if (html.includes("serviceWorker.getRegistrations")) {
    return;
  }

  html = html.replace("</body>", `${cleanupScript}\n</body>`);
  fs.writeFileSync(indexPath, html);
  console.log("Script de limpeza de service worker adicionado ao index.html");
}

try {
  if (!fs.existsSync(distPath)) {
    console.log("dist nao encontrado. Pulando pos-build.");
    process.exit(0);
  }

  writeMetadata();
  ensureServiceWorkerCleanupScript();
  console.log("Pos-build web concluido.");
} catch (error) {
  console.error("Falha no pos-build web:", error);
  process.exit(1);
}

