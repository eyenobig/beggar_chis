// Hardware-free regressions: run with node --test scripts/cfb-client.test.mjs.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { ref, computed, watch, reactive, nextTick } from 'vue'
import { createPinia, defineStore, setActivePinia } from 'pinia'

const flush = () => new Promise((resolve) => setImmediate(resolve))

function clock() {
  let now = 0
  let next = 0
  const pending = new Map()
  return {
    setTimeout(fn, ms) { const id = ++next; pending.set(id, { fn, at: now + ms }); return id },
    clearTimeout(id) { pending.delete(id) },
    async advance(ms) {
      now += ms
      for (const [id, timer] of [...pending]) {
        if (timer.at <= now) { pending.delete(id); timer.fn() }
      }
      await flush()
    },
    get size() { return pending.size },
  }
}

// Execute the real module body; only its platform/import boundary is replaced.
async function loadModule(path, bindings, exports) {
  const source = (await readFile(new URL(`../${path}`, import.meta.url), 'utf8'))
    .replace(/^import .*$/gm, '')
    .replace(/^export /gm, '')
  return vm.runInNewContext(`${source}\n;({ ${exports.join(', ')} })`, bindings, { filename: path })
}

function fakeCommand({ onSpawn, onKill } = {}) {
  const handlers = new Map()
  const command = {
    spawned: false,
    kills: 0,
    stdout: { on: (_, cb) => handlers.set('stdout', cb) },
    stderr: { on: (_, cb) => handlers.set('stderr', cb) },
    on: (event, cb) => handlers.set(event, cb),
    emit: (event, payload) => handlers.get(event)?.(payload),
    async spawn() {
      command.spawned = true
      onSpawn?.(command)
      return {
        pid: 123,
        async kill() {
          command.kills++
          if (onKill) return onKill(command)
          command.emit('close', { code: 1 })
        },
      }
    },
  }
  return command
}

const success = () => fakeCommand({ onSpawn: (c) => c.emit('close', { code: 0 }) })

async function transport(commands, extra = {}) {
  const time = clock()
  const settings = { withGlobalArgs: (args) => args, cfbBinPath: '', ruleDataDir: '' }
  const api = await loadModule('src-ui/src/services/cfb/transport.js', {
    window: { __TAURI_INTERNALS__: {} },
    useCfbSettings: () => settings,
    Command: { sidecar: () => { assert.ok(commands.length, 'unexpected command'); return commands.shift() } },
    setTimeout: time.setTimeout,
    clearTimeout: time.clearTimeout,
    ...extra,
  }, ['executeCfb', 'streamCfb'])
  return { ...api, time, settings }
}

test('timeout kills only its child and holds the queue until close', async () => {
  const hung = fakeCommand({ onKill() {} })
  const next = success()
  const api = await transport([hung, next])
  const events = []
  const first = api.executeCfb(['info'], (ev) => events.push(ev))
  const second = api.executeCfb(['detect'])
  await flush()
  hung.emit('stdout', '{"type":"info","present":true}')
  await api.time.advance(30000)
  assert.equal(hung.kills, 1)
  assert.equal(next.spawned, false, 'kill completion alone must not unlock the queue')
  hung.emit('close', { code: 1 })
  assert.equal((await first).errorKind, 'timeout')
  assert.equal((await second).code, 0)
  assert.equal(events.length, 0, 'discard partial results from a timed-out command')
  assert.equal(api.time.size, 0)
})

test('buffered output handles complete lines without newline and clears its timer', async () => {
  const command = fakeCommand()
  const api = await transport([command])
  const events = []
  const result = api.executeCfb(['info'], (ev) => events.push(ev.type))
  await flush()
  command.emit('stdout', '{"type":"log"}')
  command.emit('stdout', '{"type":"info"}')
  assert.deepEqual(events, [])
  command.emit('close', { code: 0 })
  assert.equal((await result).code, 0)
  assert.deepEqual(events, ['log', 'info'])
  await api.time.advance(60000)
  assert.equal(command.kills, 0)
  assert.equal(api.time.size, 0)
})

test('streaming delivers progress immediately and has no short-command timeout', async () => {
  const command = fakeCommand()
  const api = await transport([command])
  const events = []
  let child
  const result = api.streamCfb(['burn'], (ev) => events.push(ev.type), (c) => { child = c })
  await flush()
  command.emit('stdout', '{"type":"progress"}')
  command.emit('stdout', '{"type":"log"}\r\n{"type":"progress"}\n')
  assert.deepEqual(events, ['progress', 'log', 'progress'])
  await api.time.advance(120000)
  assert.equal(command.kills, 0)
  await child.kill()
  assert.equal((await result).code, 1)
})

test('process error cleans up before the next operation', async () => {
  const command = fakeCommand({ onKill() {} })
  const next = success()
  const api = await transport([command, next])
  const events = []
  const first = api.streamCfb(['dump'], (ev) => events.push(ev))
  const second = api.executeCfb(['info'])
  await flush()
  command.emit('error', 'pipe failed')
  await flush()
  assert.equal(command.kills, 1)
  assert.equal(next.spawned, false)
  command.emit('stdout', '{"type":"result","ok":true}')
  assert.equal(events.length, 0, 'discard late events after a process failure')
  command.emit('close', { code: 1 })
  assert.equal((await first).error, 'pipe failed')
  assert.equal((await second).code, 0)
})

test('failed cleanup blocks new processes until the old process actually exits', async () => {
  const hung = fakeCommand({ onKill() { throw new Error('kill failed') } })
  const next = success()
  const api = await transport([hung, next])
  const first = api.executeCfb(['info'])
  const second = api.executeCfb(['detect'])
  await flush()
  await api.time.advance(30000)
  await api.time.advance(5000)
  assert.match((await first).error, /has not exited/)
  assert.match((await second).error, /has not exited/)
  assert.equal(next.spawned, false)
  hung.emit('close', { code: 1 })
  assert.equal((await api.executeCfb(['detect'])).code, 0)
  assert.equal(api.time.size, 0)
})

test('spawn failure does not poison the command queue', async () => {
  const fail = fakeCommand()
  fail.spawn = async () => { throw new Error('executable missing') }
  const api = await transport([fail, success()])
  assert.equal((await api.executeCfb(['info'])).error, 'executable missing')
  assert.equal((await api.executeCfb(['detect'])).code, 0)
})

test('direct executable also uses tracked spawn and kills on timeout', async () => {
  let channel
  let kills = 0
  const api = await transport([], {
    Channel: class {},
    invoke: async (name, args) => {
      if (name === 'resolve_cfb_binary') return 'C:/cfb.exe'
      if (name === 'cfb_spawn') { channel = args.onEvent; return 789 }
      if (name === 'cfb_kill_process') {
        assert.equal(args.pid, 789)
        kills++
        channel.onmessage({ event: 'Terminated', payload: { code: 1 } })
        return
      }
      assert.fail(`unexpected invocation: ${name}`)
    },
  })
  api.settings.cfbBinPath = 'C:/cfb.exe'
  const result = api.executeCfb(['info'])
  await flush()
  await api.time.advance(30000)
  assert.equal((await result).errorKind, 'timeout')
  assert.equal(kills, 1)
})

test('nonzero exit preserves cfb error events and stderr', async () => {
  const command = fakeCommand({ onSpawn(c) {
    c.emit('stdout', '{"type":"error","message":"port busy"}')
    c.emit('stderr', 'diagnostic')
    c.emit('close', { code: 3 })
  } })
  const api = await transport([command])
  const events = []
  const result = await api.executeCfb(['info'], (ev) => events.push(ev))
  assert.equal(result.code, 3)
  assert.equal(result.error, 'diagnostic')
  assert.equal(events[0].message, 'port busy')
  assert.equal(command.kills, 0)
})

async function connection() {
  setActivePinia(createPinia())
  const time = clock()
  const settings = reactive({ preferredPort: '', setPreferredPort(p) { this.preferredPort = p } })
  const fixture = {
    ports: [{ type: 'port', port: 'COM3', burner: true, open: true }],
    detectError: '', selectError: '', detectCalls: 0,
    runningCount: 0,
  }
  const client = {
    async detect(onEvent) {
      fixture.detectCalls++
      for (const port of fixture.ports) onEvent(port)
      return { code: fixture.detectError ? -1 : 0, error: fixture.detectError || undefined }
    },
    async selectPort(port, onEvent) {
      if (!fixture.selectError) onEvent({ type: 'selected', port })
      return { code: fixture.selectError ? -1 : 0, error: fixture.selectError || undefined }
    },
    async disconnect() { return { code: 0 } },
  }
  const { useConnection } = await loadModule('src-ui/src/stores/useConnection.js', {
    ref, computed, defineStore, cfbClient: client, inTauri: true,
    useCfbSettings: () => settings, navigator: { userAgent: 'Windows' },
    useTaskProgress: () => fixture,
    i18n: { global: { t: (key) => key } },
  }, ['useConnection'])
  return { conn: useConnection(), client, settings, fixture, time }
}

test('busy port stays selected but is not reported as connected, including startup and picking', async () => {
  const { conn, fixture } = await connection()
  fixture.ports[0].open = false
  await conn.startWatching()
  assert.equal(conn.selectedPort, 'COM3')
  assert.equal(conn.isConnected, false)
  assert.equal(conn.permBlocked, true)
  assert.equal(await conn.pickDevice('COM3'), false)
  assert.equal(conn.isConnected, false)
})

test('reconnect refreshes actual port availability and can recover from an access error', async () => {
  const { conn, fixture } = await connection()
  await conn.detect()
  conn.markUnavailable('port busy')
  assert.equal(conn.isConnected, false)
  assert.equal(conn.lastError, 'port busy')
  fixture.ports[0].open = false
  assert.equal(await conn.connect(), false)
  fixture.ports[0].open = true
  assert.equal(await conn.connect(), true)
  assert.equal(conn.isConnected, true)
  assert.equal(conn.lastError, '')
})

test('detect and select transport failures cannot retain a stale connected state', async () => {
  const { conn, fixture } = await connection()
  await conn.detect()
  fixture.selectError = 'select timed out'
  assert.equal(await conn.detect(), false)
  assert.equal(conn.isConnected, false)
  assert.equal(conn.lastError, fixture.selectError)
  fixture.selectError = ''
  await conn.detect()
  fixture.detectError = 'detect timed out'
  assert.equal(await conn.detect(), false)
  assert.equal(conn.isConnected, false)
  assert.equal(conn.lastError, fixture.detectError)
})

async function cartridge(platform = 'gba') {
  const fixture = await connection()
  await fixture.conn.detect()
  const emulator = reactive({ currentPlatform: platform, setPlatform(p) { this.currentPlatform = p } })
  const { useCartData } = await loadModule('src-ui/src/stores/useCartData.js', {
    ref, computed, watch, defineStore, inTauri: true,
    cfbClient: fixture.client,
    useConnection: () => fixture.conn,
    useCfbSettings: () => fixture.settings,
    useEmulator: () => emulator,
    useLogStore: () => ({ addLog() {} }),
    useTaskProgress: () => ({}),
    useToast: () => ({ info() {}, error() {}, success() {} }),
    i18n: { global: { t: (key) => key } },
    romTitleOf: (info) => info?.rom_title,
    gameCodeOf: (info) => info?.game_code,
    setTimeout: fixture.time.setTimeout,
    clearTimeout: fixture.time.clearTimeout,
  }, ['useCartData'])
  return { ...fixture, cart: useCartData() }
}

for (const platform of ['gba', 'gbc']) {
  for (const [language, message] of Object.entries({
    en: 'Failed to open port COM3: Port COM3 was not released by cfb (PID 14648) within 15s; aborted.',
    zh: '打开端口 COM3 失败: 端口 COM3 在 15s 内未被 cfb(PID 14648)释放，已中止。',
  })) {
    test(`${platform}/${language}: occupied port stops retries and retains the error after disconnect`, async () => {
      const { cart, conn, client, fixture } = await cartridge(platform)
      let reads = 0
      client.readCartridge = async (_, emit) => {
        reads++
        emit({ type: 'error', message })
        return { code: 3, error: 'cfb exited with code 3' }
      }
      await cart.readCart()
      await nextTick()
      assert.equal(reads, 1)
      assert.equal(fixture.detectCalls, 1, 'busy port must not trigger redetection')
      assert.equal(conn.isConnected, false)
      assert.equal(cart.cartError, message)
      assert.equal(conn.lastError, message)
      assert.equal(cart.cartReading, false)
    })
  }
}

test('transport timeout stops mode fallback and disconnects', async () => {
  const { cart, conn, client } = await cartridge()
  let reads = 0
  client.readCartridge = async () => {
    reads++
    return { code: -1, error: 'cfb timeout: info', errorKind: 'timeout' }
  }
  await cart.readCart()
  assert.equal(reads, 1)
  assert.equal(conn.isConnected, false)
  assert.equal(cart.cartError, 'cfb timeout: info')
})

test('normal cartridge identification still succeeds', async () => {
  const { cart, conn, client } = await cartridge()
  client.readCartridge = async (_, emit) => {
    emit({ type: 'info', kind: 'gba', present: true, rom_title: 'TEST', port: 'COM3' })
    return { code: 0 }
  }
  await cart.readCart()
  assert.equal(cart.cartInfo.rom_title, 'TEST')
  assert.equal(cart.cartError, '')
  assert.equal(conn.isConnected, true)
})

test('weak GBA identification can still fall back to GB/GBC', async () => {
  const { cart, client, time } = await cartridge()
  const modes = []
  client.readCartridge = async ({ mbc }, emit) => {
    modes.push(mbc)
    emit(mbc
      ? { type: 'info', kind: 'gb_mbc', present: true, rom_title: 'GB TEST' }
      : { type: 'info', kind: 'unknown', capacity_bytes: 1024 })
    return { code: 0 }
  }
  const result = cart.readCart()
  await flush()
  await time.advance(280)
  await result
  assert.deepEqual(modes, [false, true])
  assert.equal(cart.cartInfo.kind, 'gb_mbc')
})

test('a changed COM number is redetected once and identification recovers', async () => {
  const { cart, conn, client, fixture, time } = await cartridge()
  let reads = 0
  client.readCartridge = async (_, emit) => {
    reads++
    if (reads === 1) {
      fixture.ports = [{ type: 'port', port: 'COM4', burner: true, open: true }]
      emit({ type: 'error', message: 'Failed to open port COM3: cannot find the file' })
      return { code: 3, error: 'cfb exited with code 3' }
    }
    assert.equal(conn.selectedPort, 'COM4')
    emit({ type: 'info', kind: 'gba', present: true, rom_title: 'TEST', port: 'COM4' })
    return { code: 0 }
  }
  const result = cart.readCart()
  await flush()
  await time.advance(200)
  await result
  assert.equal(reads, 2)
  assert.equal(fixture.detectCalls, 2)
  assert.equal(conn.isConnected, true)
  assert.equal(cart.cartError, '')
})

test('an empty cartridge slot does not disconnect a usable burner', async () => {
  const { cart, conn, client, time } = await cartridge()
  client.readCartridge = async (_, emit) => {
    emit({ type: 'error', message: 'No cartridge detected' })
    return { code: 3, error: 'cfb exited with code 3' }
  }
  const result = cart.readCart()
  await flush()
  for (const delay of [280, 180, 360]) await time.advance(delay)
  await result
  assert.equal(conn.isConnected, true)
  assert.equal(cart.cartInfo, null)
  assert.equal(cart.cartError, 'No cartridge detected')
})

test('manual recovery can run when an unreleased process blocks ordinary commands', async () => {
  const hung = fakeCommand({ onKill() { throw new Error('kill failed') } })
  const repair = fakeCommand({ onSpawn(c) {
    hung.emit('close', { code: 1 })
    c.emit('close', { code: 0 })
  } })
  const api = await transport([hung, repair, success()])
  const first = api.executeCfb(['info'])
  await flush()
  await api.time.advance(30000)
  await api.time.advance(5000)
  assert.match((await first).error, /has not exited/)
  assert.equal((await api.executeCfb(['detect'])).code, -1)
  assert.equal((await api.streamCfb(['udev'], null, null, { forceSidecar: true, recovery: true })).code, 0)
  assert.equal((await api.executeCfb(['detect'])).code, 0)
})

test('manual repair refuses to interrupt active tasks or DirectPlay', async () => {
  const { conn, client, fixture } = await connection()
  let repairs = 0
  client.installUdev = async () => { repairs++; return { code: 0 } }
  fixture.runningCount = 1
  assert.equal(await conn.fixSerialPerms(), false)
  fixture.runningCount = 0
  conn.directPlay = true
  assert.equal(await conn.fixSerialPerms(), false)
  assert.equal(repairs, 0)
  conn.directPlay = false
  assert.equal(await conn.fixSerialPerms(), true)
  assert.equal(repairs, 1)
  assert.equal(conn.isConnected, true)
})

test('repair failure preserves the reason and allows another manual attempt', async () => {
  const { conn, client } = await connection()
  client.installUdev = async () => ({ code: -1, error: 'authorization canceled' })
  assert.equal(await conn.fixSerialPerms(), false)
  assert.equal(conn.lastError, 'authorization canceled')
  assert.equal(conn.fixingPerms, false)
  client.installUdev = async () => ({ code: 0 })
  assert.equal(await conn.fixSerialPerms(), true)
  assert.equal(conn.isConnected, true)
})
