/**
 * Script pós-build para web
 * Garante que o index.html tem as configurações corretas
 */

const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distPath, 'index.html');

// Links das fontes de ícones via CDN (sem ionicons que está com problema de MIME)
const fontLinks = `
  <!-- Google Fonts para Material Icons -->
  <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
  <!-- Font Awesome -->
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet" crossorigin="anonymous" />
`;

try {
  if (!fs.existsSync(indexPath)) {
    console.log('⚠️  index.html not found in dist, skipping post-build script');
    process.exit(0);
  }

  let html = fs.readFileSync(indexPath, 'utf8');

  // Remove ionicons CDN problemático se existir
  html = html.replace(/<link[^>]*ionicons[^>]*>/gi, '');

  // Injeta os links das fontes antes do </head> se ainda não existirem
  if (!html.includes('fonts.googleapis.com/icon')) {
    html = html.replace('</head>', `${fontLinks}</head>`);
    fs.writeFileSync(indexPath, html);
    console.log('✅ Icon fonts CDN links injected into index.html');
  } else {
    fs.writeFileSync(indexPath, html);
    console.log('ℹ️  Icon fonts already present in index.html');
  }

  console.log('✅ Post-build script completed successfully');
} catch (error) {
  console.error('❌ Error in post-build script:', error);
  process.exit(1);
}
