import { useCfbSettings } from '../../stores/useCfbSettings'
import { useConnection } from '../../stores/useConnection'
import { executeCfb, streamCfb } from './transport'

function withMbc(args, mbc) {
  if (mbc) args.push('--mbc')
  return args
}

/** 操作必须打唯一选中口：会话 selectedPort > 持久 preferredPort。 */
function withTargetPort(args) {
  const out = [...args]
  if (out.includes('--port')) return out
  const port = useConnection().selectedPort || useCfbSettings().preferredPort
  if (port) out.push('--port', port)
  return out
}

function withBurnArgs(args) {
  const settings = useCfbSettings()
  const out = withTargetPort(args)
  if (settings.chipErase) out.push('--chip-erase')
  if (!settings.verifyAfter) out.push('--no-verify')
  return out
}

export const cfbClient = Object.freeze({
  detect: (onEvent) => executeCfb(['detect'], onEvent),
  selectPort: (port, onEvent) => executeCfb(['select', '--port', port], onEvent),
  disconnect: (onEvent) => executeCfb(['disconnect'], onEvent),
  setVoltage: (voltage, onEvent) =>
    executeCfb(voltage === 'auto' ? ['voltage', '--clear'] : ['voltage', voltage], onEvent),
  readRomFile: (path, onEvent) => executeCfb(['rom-info', '--file', path], onEvent),
  version: (onEvent) => executeCfb(['version'], onEvent),

  readCartridge({ mbc = false } = {}, onEvent) {
    return executeCfb(withTargetPort(withMbc(['info'], mbc)), onEvent)
  },

  readRtc({ mbc = false } = {}, onEvent) {
    return executeCfb(withTargetPort(withMbc(['rtc'], mbc)), onEvent)
  },

  burnRom({ romPath, mbc = false }, onEvent, onChild) {
    return streamCfb(withBurnArgs(withMbc(['burn', '--rom', romPath], mbc)), onEvent, onChild)
  },

  erase({ mbc = false } = {}, onEvent, onChild) {
    return streamCfb(withTargetPort(withMbc(['erase'], mbc)), onEvent, onChild)
  },

  dumpRom({ outputPath, mbc = false }, onEvent, onChild) {
    return streamCfb(withTargetPort(withMbc(['dump', '--out', outputPath], mbc)), onEvent, onChild)
  },

  // ---- 存档 (save RAM) ----
  saveDump({ outputPath, mbc = false, type }, onEvent, onChild) {
    const args = withMbc(['save-dump', '--out', outputPath], mbc)
    if (type) args.push('--type', type)
    return streamCfb(withTargetPort(args), onEvent, onChild)
  },
  saveWrite({ savePath, mbc = false, type }, onEvent, onChild) {
    const args = withMbc(['save-write', '--file', savePath], mbc)
    if (type) args.push('--type', type)
    return streamCfb(withTargetPort(args), onEvent, onChild)
  },
  saveVerify({ savePath, mbc = false, type }, onEvent, onChild) {
    const args = withMbc(['save-verify', '--file', savePath], mbc)
    if (type) args.push('--type', type)
    return streamCfb(withTargetPort(args), onEvent, onChild)
  },
  saveErase({ mbc = false, type, len }, onEvent, onChild) {
    const args = withTargetPort(withMbc(['save-erase'], mbc))
    if (type) args.push('--type', type)
    if (len) args.push('--len', String(len))
    return streamCfb(args, onEvent, onChild)
  },
})
