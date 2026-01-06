/**
 * Script pós-build para web
 * Garante que o index.html tem as configurações corretas
 * Copia o Service Worker e gera metadata.json
 */

const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distPath, 'index.html');
const metadataPath = path.join(distPath, 'metadata.json');
const packageJsonPath = path.join(__dirname, '..', 'package.json');

// Links das fontes de ícones via CDN com preconnect e preload para carregamento mais rápido
const fontLinks = `
  <!-- Preconnect para fontes -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin />
  <!-- Google Fonts para Material Icons (preload + stylesheet) -->
  <link rel="preload" href="https://fonts.googleapis.com/icon?family=Material+Icons" as="style" />
  <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
  <!-- Font Awesome (preload + stylesheet) -->
  <link rel="preload" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" as="style" crossorigin="anonymous" />
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet" crossorigin="anonymous" />
`;

// Função para encontrar arquivos de imagem no diretório assets
function findImageFiles(distPath) {
  // Expo cria assets/assets, então o caminho correto é /assets/assets/
  const assetsPath = path.join(distPath, 'assets', 'assets');
  const imagePreloadLinks = [];
  const foundImages = new Set(); // Evita duplicatas
  const imageManifest = {}; // Mapa de nome -> caminho com hash
  
  if (fs.existsSync(assetsPath)) {
    try {
      const files = fs.readdirSync(assetsPath);
      
      // Procura por imagens de dança e logo (com hash no nome)
      files.forEach(file => {
        if (file.match(/^dance_ico[1-4]\..+\.png$/)) {
          const imageName = file.match(/^(dance_ico[1-4])\./)?.[1];
          if (imageName && !foundImages.has(imageName)) {
            const imagePath = `/assets/assets/${file}`;
            imagePreloadLinks.push(`  <link rel="preload" as="image" href="${imagePath}" fetchpriority="high" />`);
            foundImages.add(imageName);
            imageManifest[imageName] = imagePath;
          }
        } else if (file.match(/^cdmf-logo\..+\.png$/)) {
          if (!foundImages.has('cdmf-logo')) {
            const imagePath = `/assets/assets/${file}`;
            imagePreloadLinks.push(`  <link rel="preload" as="image" href="${imagePath}" fetchpriority="high" />`);
            foundImages.add('cdmf-logo');
            imageManifest['cdmf-logo'] = imagePath;
          }
        } else if (file.match(/^google\..+\.png$/)) {
          if (!foundImages.has('google')) {
            const imagePath = `/assets/assets/${file}`;
            imagePreloadLinks.push(`  <link rel="preload" as="image" href="${imagePath}" fetchpriority="high" />`);
            foundImages.add('google');
            imageManifest['google'] = imagePath;
          }
        }
      });
      
      // Salva o manifest de imagens para o Preloader usar
      if (Object.keys(imageManifest).length > 0) {
        const manifestPath = path.join(distPath, 'image-manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(imageManifest, null, 2));
        console.log(`✅ Image manifest saved with ${Object.keys(imageManifest).length} images`);
      }
    } catch (e) {
      console.warn('Erro ao ler diretório assets:', e.message);
    }
  }
  
  // Retorna os links de preload formatados
  if (imagePreloadLinks.length > 0) {
    return '\n  <!-- Pré-carregamento de imagens -->\n' + imagePreloadLinks.join('\n') + '\n';
  }
  return '';
}

try {
  if (!fs.existsSync(indexPath)) {
    console.log('⚠️  index.html not found in dist, skipping post-build script');
    process.exit(0);
  }

  let html = fs.readFileSync(indexPath, 'utf8');

  // Remove ionicons CDN problemático se existir
  html = html.replace(/<link[^>]*ionicons[^>]*>/gi, '');
  
  // Remove links de pré-carregamento de imagens antigos (com ou sem hash)
  html = html.replace(/<link[^>]*rel=["']preload["'][^>]*dance_ico[^>]*>/gi, '');
  html = html.replace(/<link[^>]*rel=["']preload["'][^>]*cdmf-logo[^>]*>/gi, '');
  
  // Remove comentários vazios de pré-carregamento
  html = html.replace(/<!-- Pré-carregamento de imagens de ícones de dança -->\s*\n\s*\n/gi, '');

  // Injeta os links das fontes e pré-carregamento de imagens antes do </head>
  let injected = false;
  if (!html.includes('fonts.googleapis.com/icon')) {
    html = html.replace('</head>', `${fontLinks}</head>`);
    injected = true;
  }
  
  // Injeta pré-carregamento de imagens com nomes corretos (com hash)
  const imagePreloadLinks = findImageFiles(distPath);
  if (imagePreloadLinks) {
    html = html.replace('</head>', `${imagePreloadLinks}</head>`);
    injected = true;
  }
  
  if (injected) {
    fs.writeFileSync(indexPath, html);
    console.log('✅ Icon fonts and image preload links injected into index.html');
  } else {
    fs.writeFileSync(indexPath, html);
    console.log('ℹ️  Icon fonts and preload links already present in index.html');
  }

  // Gera metadata.json com versão e timestamp
  let appVersion = '1.0.0';
  const buildTime = Date.now(); // Usa o mesmo buildTime em todos os lugares
  
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    appVersion = packageJson.version || '1.0.0';
    const metadata = {
      version: appVersion,
      buildTime: buildTime,
    };
    
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`✅ metadata.json generated with version ${appVersion} and buildTime ${buildTime}`);
  } catch (metadataError) {
    console.warn('⚠️  Could not generate metadata.json:', metadataError.message);
    // Cria um metadata.json básico mesmo se falhar
    try {
      const fallbackMetadata = {
        version: appVersion,
        buildTime: buildTime,
      };
      fs.writeFileSync(metadataPath, JSON.stringify(fallbackMetadata, null, 2));
    } catch (e) {
      // Ignora erro de fallback
    }
  }

  // Nota: Não é mais necessário atualizar versão no index.html
  // O Expo usa cache busting automático com hashes nos nomes dos arquivos
  // Ex: index-afbe6e209ad273fd9f9daf16828ee58f.js
  console.log(`✅ Build completed - Expo handles cache busting automatically via file hashes`);

  // Nota: useAppVersion.ts não precisa mais de atualização
  // A versão agora é fixa e o buildTime é gerenciado via metadata.json

  // Nota: UpdateChecker.tsx não precisa mais de atualização no build
  // A nova implementação detecta versões automaticamente via metadata.json + localStorage

  // Injeta script de desregistro de Service Workers antigos no index.html
  // Isso garante que SWs antigos não interfiram com o carregamento
  try {
    let indexHtml = fs.readFileSync(indexPath, 'utf8');
    
    // Adiciona script para desregistrar SWs antigos APENAS uma vez na inicialização
    const swCleanupScript = `
  <script>
    // Remove Service Workers antigos para garantir carregamento limpo
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(regs) {
        regs.forEach(function(r) { r.unregister(); });
      });
    }
  </script>`;
    
    // Adiciona antes do fechamento do body se ainda não existir
    if (!indexHtml.includes('serviceWorker.getRegistrations')) {
      indexHtml = indexHtml.replace('</body>', `${swCleanupScript}\n</body>`);
      fs.writeFileSync(indexPath, indexHtml);
      console.log('✅ Service Worker cleanup script added to index.html');
    }
  } catch (e) {
    console.warn('⚠️  Could not add SW cleanup script:', e.message);
  }
  
  // Copia a logo CDMF como favicon para a raiz do dist
  try {
    const assetsPath = path.join(distPath, 'assets', 'assets');
    if (fs.existsSync(assetsPath)) {
      const files = fs.readdirSync(assetsPath);
      const logoFile = files.find(f => f.startsWith('cdmf-logo.') && f.endsWith('.png'));
      if (logoFile) {
        const sourcePath = path.join(assetsPath, logoFile);
        const destPath = path.join(distPath, 'cdmf-logo.png');
        fs.copyFileSync(sourcePath, destPath);
        console.log('✅ CDMF logo copied as favicon to dist root');
      }
    }
  } catch (e) {
    console.warn('⚠️  Could not copy favicon:', e.message);
  }
  
  console.log('✅ Post-build script completed successfully');
} catch (error) {
  console.error('❌ Error in post-build script:', error);
  process.exit(1);
}
