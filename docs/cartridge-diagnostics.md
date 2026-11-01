# 卡带识别失败日志

卡带识别和自动识别会将诊断写入客户端 Logs，前缀为 `[cfb-diagnostic]`。排查时保留故障前后同一次识别的完整日志，包括最后的错误和进程清理结果。日志面板保留最近 500 条，重启后恢复最近 200 条；新日志会替换更早的记录，请在故障后及时收集。

## 先看客户端是否启动了 cfb

| 阶段 | 含义 |
| --- | --- |
| `client_resolve` | 查找实际使用的 cfb |
| `client_spawn` | 启动进程，记录路径和 PID |
| `client_stderr` | cfb 的错误输出 |
| `client_exit` | 进程退出码 |
| `client_error` | 启动或运行异常 |
| `client_timeout` | 客户端等待超时，记录最后收到的设备阶段 |
| `client_cleanup` | 终止进程及确认退出的结果 |

同一次客户端调用用 `invocation_id` 关联。`client_spawn` 的 `ok` 表示已创建进程，不代表串口或卡带正常。超时记录中的 `last_device_stage` 和 `device_trace_id` 指向 cfb 最后发出的诊断；为空表示尚未收到设备阶段日志，不能据此判断硬件故障。

## 再看 cfb 停在哪一步

| 阶段 | 含义 |
| --- | --- |
| `process`、`resolve_port` | cfb 进入识别命令、选择端口 |
| `lease`、`open_port` | 等待端口释放、打开系统串口 |
| `reset`、`power`、`warm_up` | 复位、上电、首包预热 |
| `gba_flash`、`gba_flash_attempt` | GBA 芯片识别及内部探测轮次 |
| `gba_jedec` | 读取芯片 ID |
| `gba_cfi_enter`、`gba_cfi_read`、`gba_cfi_reset` | 进入、读取、退出 CFI |
| `gba_header` | 读取 GBA 游戏头 |
| `mbc_header`、`mbc_flash` | GB/GBC 游戏头与芯片容量 |
| `rtc` | RTC 探测 |
| `power_idle`、`complete` | 恢复空闲供电、识别结果 |

`trace_id` 关联同一 cfb 进程，`attempt` 区分整段重试，`elapsed_ms` 和 `stage_elapsed_ms` 分别是总耗时和阶段耗时。重点查看 `failed` 记录，以及超时前最后一个 `start`。`done` 仅表示调用返回，应结合该阶段的底层错误判断；没有 RTC 不等于通信失败。

底层失败记录系统错误、操作码、地址、预期和实际收到的字节数、超时值，不记录 ROM 或存档内容。诊断不改变供电、读取或重试行为。

客户端可以记录旧版 cfb 的启动和超时，但完整设备阶段日志需要同时更新带有 `diagnostic` 事件的 cfb。此功能用于收集故障证据，不代表已经修复设备无响应的问题。
