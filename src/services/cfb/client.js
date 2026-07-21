import { useCfbSettings } from '../../stores/useCfbSettings'
import { executeCfb, streamCfb } from './transport'

function withMbc(args, mbc) {
  if (mbc) args.push('--mbc')
  return args
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
    const args = useCfbSettings().withPortArgs(withMbc(['info'], mbc))
    return executeCfb(args, onEvent)
  },

  readRtc({ mbc = false } = {}, onEvent) {
    const args = useCfbSettings().withPortArgs(withMbc(['rtc'], mbc))
    return executeCfb(args, onEvent)
  },

  burnRom({ romPath, mbc = false }, onEvent) {
    const args = useCfbSettings().withBurnArgs(withMbc(['burn', '--rom', romPath], mbc))
    return streamCfb(args, onEvent)
  },

  erase({ mbc = false } = {}, onEvent) {
    const args = useCfbSettings().withPortArgs(withMbc(['erase'], mbc))
    return streamCfb(args, onEvent)
  },

  dumpRom({ outputPath, mbc = false }, onEvent) {
    const args = useCfbSettings().withPortArgs(withMbc(['dump', '--out', outputPath], mbc))
    return streamCfb(args, onEvent)
  },
})
