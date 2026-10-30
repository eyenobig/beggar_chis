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
  if (!settings.verifyAfter) out.push('--no-verify')
  return out
}

export const cfbClient = Object.freeze({
  detect: (onEvent) => executeCfb(['detect'], onEvent),
  // 走 streamCfb（无 30s 超时）：pkexec 密码框可能等用户输入很久。
  // forceSidecar：串口修复是客户端自身能力（udev/释放占用随应用版本实现），
  // 必须用内置 sidecar——用户配置的 cfbBinPath 引擎可能较旧而没有对应分支。
  // 修复可在遗留进程阻塞普通命令时启动，仍与正在运行的命令串行执行。
  installUdev: (onEvent, onChild) => streamCfb(['udev'], onEvent, onChild, { forceSidecar: true, recovery: true }),
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
    const settings = useCfbSettings()
    const burn = () =>
      streamCfb(withBurnArgs(withMbc(['burn', '--rom', romPath], mbc)), onEvent, onChild)
    if (!settings.chipErase) return burn()
    // 整片清场走独立 `cfb erase`，再默认 burn。
    // 不要传 --no-erase：GBA 会卡在写入 0% / @0x4000；空白扇区由 cfb 自己跳过 0x30。
    return streamCfb(withTargetPort(withMbc(['erase'], mbc)), onEvent, onChild).then((erased) => {
      if (erased.error) return erased
      return burn()
    })
  },

  erase({ mbc = false } = {}, onEvent, onChild) {
    const args = withMbc(['erase'], mbc)
    // 仅 GB/GBC 有效：连隐藏头部区（开机窗）一起清，旧头部不再残留
    if (mbc && useCfbSettings().eraseBoot) args.push('--boot')
    return streamCfb(withTargetPort(args), onEvent, onChild)
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
