const sharp = require('sharp');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');

async function createAdaptiveIcon() {
  const inputPath = path.join(assetsDir, 'icon.png');
  const outputPath = path.join(assetsDir, 'adaptive-icon.png');
  
  // Para Android Adaptive Icons, o conteúdo deve estar na "safe zone" central
  // A safe zone é aproximadamente 66% do tamanho total
  // Vamos redimensionar o ícone para 680px e colocá-lo no centro de uma imagem 1024x1024
  
  const iconSize = 680; // Tamanho do ícone na safe zone
  const canvasSize = 1024;
  const padding = Math.floor((canvasSize - iconSize) / 2);
  
  try {
    // Redimensionar o ícone original
    const resizedIcon = await sharp(inputPath)
      .resize(iconSize, iconSize, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toBuffer();
    
    // Criar canvas com fundo e colocar ícone centralizado
    await sharp({
      create: {
        width: canvasSize,
        height: canvasSize,
        channels: 4,
        background: { r: 26, g: 26, b: 46, alpha: 1 } // #1a1a2e
      }
    })
    .composite([{
      input: resizedIcon,
      top: padding,
      left: padding
    }])
    .png()
    .toFile(outputPath);
    
    console.log('✅ adaptive-icon.png criado com sucesso!');
    console.log(`   Ícone: ${iconSize}x${iconSize}px centralizado em ${canvasSize}x${canvasSize}px`);
  } catch (error) {
    console.error('❌ Erro ao criar adaptive-icon:', error.message);
  }
}

createAdaptiveIcon();
