/** 贴纸编辑器同款封印图（来源：gbmake cartridge-label/seals） */
export const CARTRIDGE_SEALS = Object.freeze([
  { id: 'nintendo-us1', name: 'Nintendo US1', src: new URL('./seals/nintendo-us1-seal.png', import.meta.url).href },
  { id: 'nintendo-us2', name: 'Nintendo US2', src: new URL('./seals/nintendo-us2-seal.png', import.meta.url).href },
  { id: 'nintendo-eur', name: 'Nintendo EUR', src: new URL('./seals/nintendo-eur-seal.png', import.meta.url).href },
  { id: 'nintendo-666', name: 'Nintendo 666', src: new URL('./seals/nintendo-666-seal.png', import.meta.url).href },
  { id: 'homebrew', name: 'Homebrew', src: new URL('./seals/homebrew-seal.png', import.meta.url).href },
  { id: 'gbstudio', name: 'GB Studio', src: new URL('./seals/gbstudio-seal.png', import.meta.url).href },
])

export {
  CARTRIDGE_LAMINATIONS,
  LASER_MASKS,
  SHARD_LAYER_STYLES,
  STAR_LAYER_STYLES,
  laminationLabel,
  normalizeLaminationId,
} from './laminations'
