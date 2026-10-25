# Chis Flasher 一键诊断脚本
# 用途：用户遇到问题时双击运行（或右键"使用 PowerShell 运行"），
#       自动收集环境信息并做无破坏性检测，生成桌面上的 chis-diag-*.txt
#       发回给开发者即可定位问题。
#
# 所有检测均为只读或探测性操作，不会修改任何设置、不会杀进程、不会弹 UAC。

$ErrorActionPreference = 'Continue'
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path ([Environment]::GetFolderPath('Desktop')) "chis-diag-$stamp.txt"
$sw = [Diagnostics.Stopwatch]::StartNew()

function Sec($t) { Write-Output ""; Write-Output "===== $t =====" }

# 输出同时进文件；控制台只显示进度
function Log($s = '') { $s | Out-File -FilePath $out -Append -Encoding utf8 }

Log "Chis Flasher 诊断报告"
Log "生成时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Log "（请把本文件完整发给开发者）"

# ---------- 1. 系统环境 ----------
Sec "1. 系统环境"
$os = Get-CimInstance Win32_OperatingSystem
Log "OS: $($os.Caption) $($os.Version) (build $($_.BuildNumber))"
Log "OS 版本: $($os.Version)  架构: $($os.OSArchitecture)"
Log "系统语言: $((Get-Culture).Name) / UI: $((Get-UICulture).Name)"
Log "PowerShell: $($PSVersionTable.PSVersion)"
# DPI（影响窗口缩放问题定位）
Add-Type -AssemblyName System.Windows.Forms
$dpi = [System.Windows.Forms.Screen]::PrimaryScreen
Log "屏幕分辨率: $($dpi.Bounds.Width)x$($dpi.Bounds.Height)"
try {
  $g = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero)
  Log "系统 DPI: $([Math]::Round($g.DpiX)) ($([Math]::Round($g.DpiX / 96.0, 2))x)"
  $g.Dispose()
} catch { Log "DPI 获取失败: $_" }

# ---------- 2. 应用安装信息 ----------
Sec "2. 应用安装信息"
$instDir = Join-Path $env:LOCALAPPDATA 'Chis Flasher'
$exe = Join-Path $instDir 'chis-flasher.exe'
if (Test-Path $exe) {
  $v = (Get-Item $exe).VersionInfo
  Log "安装目录: $instDir"
  Log "客户端版本: $($v.ProductVersion)  (文件版本 $($v.FileVersion))"
  Log "安装时间: $((Get-Item $exe).CreationTime)"
} else {
  Log "!! 未找到已安装客户端（$exe）—— 用户可能用便携版/开发版"
}

# 安装器写的 cfb 路径
$pathsJson = Join-Path $instDir 'paths.json'
if (Test-Path $pathsJson) {
  Log "paths.json: $(Get-Content $pathsJson -Raw)"
}

# ---------- 3. cfb 引擎 ----------
Sec "3. cfb 烧录引擎"
$cfbCandidates = @(
  (Join-Path $instDir 'cmd\cfb.exe'),
  (Join-Path $env:LOCALAPPDATA 'com.z.chis-flasher\toolchain\cfb.exe')
)
$cfb = $null
foreach ($c in $cfbCandidates) {
  if (Test-Path $c) { $cfb = $c; break }
}
if ($cfb) {
  Log "cfb 路径: $cfb"
  Log "cfb 版本: $(& $cfb version --lang zh-CN 2>&1 | Select-Object -First 1)"
  Log "cfb 修改时间: $((Get-Item $cfb).LastWriteTime)"
} else {
  Log "!! 未找到 cfb 引擎（安装目录与 toolchain 目录都没有）"
}

# ---------- 4. 烧录器与串口（核心） ----------
Sec "4. 烧录器与串口状态"
if ($cfb) {
  Log "-- cfb detect --"
  $detect = & $cfb detect --json --lang zh-CN 2>&1
  foreach ($l in ($detect -split "`n")) { if ($l.Trim()) { Log "  $l" } }
  Log ""
  Log "-- 端口租约文件 (~/.cfb) --"
  $cfbDir = Join-Path $env:USERPROFILE '.cfb'
  if (Test-Path $cfbDir) {
    $leases = Get-ChildItem $cfbDir -Filter 'lease-*' -ErrorAction SilentlyContinue
    if ($leases) {
      foreach ($f in $leases) { Log "  $($f.Name): $(Get-Content $f.FullName -Raw)" }
      Log "  (租约文件的 ts 为秒级时间戳，与当前时间差 >60s 即为残留)"
    } else { Log "  无租约文件" }
  } else { Log "  ~/.cfb 目录不存在" }
}

Log ""
Log "-- 占用串口的进程（SkyEmu / cfb 残留）--"
foreach ($img in 'SkyEmu.exe', 'cfb.exe') {
  $procs = Get-Process -Name $img -ErrorAction SilentlyContinue
  if ($procs) {
    foreach ($p in $procs) {
      Log "  $img PID=$($p.Id) 启动于 $($p.StartTime) 路径=$($p.Path)"
    }
  } else { Log "  无 $img 进程在运行" }
}

Log ""
Log "-- USB 设备（VID_0483&PID_0721 = ChisFlash 烧录器）--"
$usb = Get-CimInstance Win32_PnPEntity | Where-Object { $_.DeviceID -like '*VID_0483&PID_0721*' }
if ($usb) {
  foreach ($d in $usb) {
    Log "  $($d.Name) | 状态=$($d.Status) | ConfigManagerErrorCode=$($d.ConfigManagerErrorCode) (0=正常)"
    if ($d.Name -match '\(COM\d+\)') { Log "    串口: $($Matches[0])" }
  }
} else {
  Log "  !! 未枚举到烧录器（未插入 / 驱动未识别 / 被禁用）"
  $anySerial = Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match 'COM\d+' } | Select-Object -First 5
  if ($anySerial) { foreach ($s in $anySerial) { Log "  （其他串口设备: $($s.Name) 状态=$($s.Status)）" } }
}

# ---------- 5. 应用配置与运行日志 ----------
Sec "5. 应用配置（脱敏）与运行日志"
$cfgFiles = @(
  (Join-Path $env:APPDATA 'chis-flasher\settings.json'),
  (Join-Path $env:LOCALAPPDATA 'Chis Flasher\paths.json')
)
foreach ($f in $cfgFiles) {
  if (Test-Path $f) {
    Log "-- $f --"
    $raw = Get-Content $f -Raw
    # 脱敏：仅去潜在 token 形键值，其余照抄（本地路径对定位问题重要）
    Log ($raw -replace '("(?:token|key|secret)[^"]*"\s*:\s*)"[^"]*"', '$1"***"')
  }
}
$evtLog = Join-Path $env:TEMP 'chis-event-listener.log'
if (Test-Path $evtLog) {
  Log "-- 事件监听日志（最后 20 行）--"
  Get-Content $evtLog -Tail 20 | ForEach-Object { Log "  $_" }
}

# ---------- 6. 网络端口 ----------
Sec "6. 本地事件端口占用 (UDP 47623)"
$udp = netstat -ano -p udp | Select-String ':47623'
if ($udp) { $udp | ForEach-Object { Log "  $($_.Line.Trim())" } }
else { Log "  未监听（应用未运行属正常；应用在运行则说明监听启动失败）" }

# ---------- 完成 ----------
Sec "完成"
Log "耗时: $([Math]::Round($sw.Elapsed.TotalSeconds, 1))s"
Log "报告文件: $out"

Write-Host ""
Write-Host "诊断完成！报告已保存到桌面：" -ForegroundColor Green
Write-Host "  $out" -ForegroundColor Yellow
Write-Host "请把这个文件发给开发者。" -ForegroundColor Green
Write-Host ""
Write-Host "按回车键关闭窗口…"
[void][Console]::ReadLine()
