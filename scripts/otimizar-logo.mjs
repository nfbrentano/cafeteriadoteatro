import sharp from 'sharp';

for (const nome of ['logo-cafeteria-do-teatro', 'logo-cafeteria-do-teatro-escura']) {
  await sharp(`assets/images/${nome}.png`)
    .trim()                          // remove a margem transparente (conteúdo real: 2438×1069)
    .resize({ height: 144 })         // ≈ 328×144
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(`assets/images/${nome}.webp`);

  console.log(`Gerado: assets/images/${nome}.webp`);
}
