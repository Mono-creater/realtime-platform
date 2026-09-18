# 切换真实 PLC 操作手册

## —— 受电弓碳滑板监测平台：从模拟器闭环切换到现场汇川 H5U

> 适用工程：`D:\realtime-platform\realtime-platform-main`
> 手册版本：v1.1　编写日期：2026-09-18
> 配套文档：《平台使用操作手册》《PLC接入操作手册》《开发者二次开发指南》《平台技术与模型公式总结》
> 适用对象：现场调试人员、平台管理员、驻站运维人员
> 本手册中所标注"**本机实测**"的输出，均为在开发机（Windows + Node v26.3.0 + 汇川 H5U 协议模拟器）上实际运行得到的原始日志，未作修饰。

---

## 目录

1. [五分钟速览](#1-五分钟速览)
2. [三种运行模式与切换原理](#2-三种运行模式与切换原理)
3. [切换前准备清单](#3-切换前准备清单)
4. [四步切换法（每步都有通过判据）](#4-四步切换法每步都有通过判据)
5. [切换后验证清单](#5-切换后验证清单)
6. [运行时临时切换与回滚](#6-运行时临时切换与回滚)
7. [故障排查对照表](#7-故障排查对照表)
8. [上线变更管理与现场作业记录单](#8-上线变更管理与现场作业记录单)
9. [附录](#9-附录)

---

## 1 五分钟速览

平台连的"是不是真 PLC"，只由 `.env` 里 **4 个变量**决定；切换动作本身只有 **改配置 + 重启** 两步，真正花时间的是切换前后的核对与验证。

**切换三句话：**

```
模拟器闭环 →真实 PLC：只改 PLC_HOST / PLC_PORT 两个值（其余全部不动）+ 重启平台
改完 .env 必须重启：运行时切换不重新读取 .env，改而重启前，连的还是旧地址
连不上会自动回退模拟：平台不会自动重试，修好后要手动再切一次
```

**本机（开发机）当前状态记录**（2026-09-18 实测）：

| 项目 | 实际值 | 说明 |
|---|---|---|
| `PLC_MODE` | `real` | 走 Modbus 协议栈，非平台自造随机数 |
| `PLC_HOST` / `PLC_PORT` | `127.0.0.1` / `1502` | 指向本机 PLC 协议模拟器，**尚未指向现场真机** |
| 寄存器段 | `30001`–`30022` | 与模拟器一致；接真机须与 PLC 程序段一致（见 3.4） |
| 数据库 | 已配置（`realtime_platform` @ `127.0.0.1:3306`，账号 `rtp`） | 告警已落库，重启后自动恢复 |
| 平台端口 | `3000` | 页面访问 `http://127.0.0.1:3000` |

> 结论：**当前平台处于"模拟器闭环"这一中间站**，数据库已接通并验证落库，现场真机接入只需执行第 4 章的第二步及其后步骤。

---

## 2 三种运行模式与切换原理

### 2.1 三种模式对照

| 模式 | `PLC_MODE` | `PLC_HOST` / `PLC_PORT` | 数据来源 | 控制写回 | 页面数据源标签 |
|---|---|---|---|---|---|
| **纯模拟** | `simulation` | 不连接任何设备 | `server.js` 自生成随机数 | 内部植物模型（假闭环） | 模拟数据 |
| **模拟器闭环** | `real` | `127.0.0.1` / `1502` | `plc-simulator.js`（Modbus TCP 从站） | 真实 Modbus 闭环 | PLC 实时数据 |
| **真实 PLC** | `real` | 现场 PLC IP / `502` | 现场汇川 H5U 实体机 | 真实 Modbus 闭环 | PLC 实时数据 |

**要点**：模拟器闭环与真实 PLC 走的是**同一套 Modbus TCP 报文、同一套寄存器语义**，平台无法区分二者，唯一差别就是 `PLC_HOST` / `PLC_PORT`。因此**推荐把"模拟器闭环"作为一切切换的中间站**——先在这台机器上把整条链路跑通，再改地址指向真机，可以排除 90% 的"到底是平台问题还是现场问题"的扯皮。

### 2.2 三条切换途径

| 途径 | 操作方式 | 生效范围 | 是否需要重启 | 适用场景 |
|---|---|---|---|---|
| A. 改 `.env` | 编辑 `realtime-platform-main/.env` | 永久，重启后仍保持 | **必须重启** | 现场正式切换（推荐） |
| B. 运行时 API | `POST /api/plc/mode` | 仅当前进程 | 不需要，重启即失效 | 快速验证、演示、排障 |
| C. 页面按钮 | 受电弓监测页的"模拟/真实"切换按钮 | 同 B | 不需要 | 有人在界面旁时最方便 |

### 2.3 四个必须知道的代码事实（本机已逐条实测）

**事实 1｜运行时切换不会重新读取 `.env`。**
`PLC_HOST`、`PLC_PORT`、`PLC_REG_*` 都是进程启动时一次性读入内存的。改了 `.env` 却用 API 切到 `real`，连的仍然是**旧地址**。→ 改配置必须重启。

**事实 2｜数据库只在启动瞬间按初始模式加载。**
启动时 `PLC_MODE != simulation` 才会尝试加载 Prisma。**本机当前已配置数据库**，启动日志为：

```
✅ Prisma Client 已初始化
✅ 当前加载 9 条记录
```

未配置数据库时则会打印下面两行，第一行是"没有数据库可用，告警存内存"的提示，**与 PLC 模式无关**，不要因为看到"（模拟模式）"就以为平台在跑假数据——同一次启动的日志里紧接着就有 `✅ 汇川 PLC 连接成功 (127.0.0.1:1502)`：

```
ℹ️ 跳过数据库加载（模拟模式），使用内存数据
⚠️ Prisma 加载失败，将以无数据库模式运行
```

**事实 3｜连不上真机时自动回退模拟，且不会自动重试。**
**本机实测**（先停掉模拟器，再启动平台）：

```
❌ 汇川 PLC 连接失败 (connect ECONNREFUSED 127.0.0.1:1502)
⚠️ 真实PLC连接失败，自动切换到模拟模式
🔄 模拟模式已启动，将生成随机传感器数据
```

随后恢复模拟器、等待 6 秒查询模式，结果仍为 `simulation` —— **证实平台不会自动重连回来**。此时必须再执行一次 `POST /api/plc/mode {"mode":"real"}`，实测立即生效：

```
POST /api/plc/mode {"mode":"real"}  →  {"mode":"real","message":"已切换到 real 模式"}
GET  /api/plc/packet                →  seq=85  temp=25.5  status=0x40
```

所以"切了 real 结果页面还是模拟数据"是**设计行为，不是 bug**：先按第 7 章查出连不上的原因，修好后**再切一次**。

**事实 4｜运行中断连恢复后会自动续采。**
采集循环内置重连退避：失败后 `2 s → 4 s → 8 s → … → 30 s` 封顶，一旦重新读通即重置退避。运行中拔网线/重启 PLC，平台页面不崩、日志每档打印一次重试提示，网络恢复后自动续采。

---

## 3 切换前准备清单

逐项打勾，缺任何一项都可能在切过去之后"没数据"。

### 3.1 现场 PLC 侧（AutoShop）

- [ ] H5U 通电、以太网口已接线，上位机 `ping` PLC IP 通
- [ ] AutoShop 中 **MBS（Modbus 从站）服务已使能**：端口 `502`、站号与 `.env` 的 `PLC_UNIT_ID` 一致（默认 `1`）
- [ ] 参考程序 `plc-program/H5U_main.st` 已按现场量程与软元件改好并下载运行
- [ ] 确认 PLC 侧 D 区段选择：**Easy 型用 D2001–D2022（D30001 不存在）**，标准型才用 D30001 段
- [ ] 确认状态字 bit6（`0x40`）已恒置——这是"扩展协议"标志，平台靠它判断走新固件路径；bit7（`0x80`）为子包有效标志
- [ ] 100 ms 采样脉冲软元件（参考程序用 `SM4010`）与实际机型一致

### 3.2 网络与安全

- [ ] 上位机/服务器防火墙放行 `502` 出方向
- [ ] 云服务器场景：`502` 只经 frp 隧道或内网访问，**绝不直接暴露公网**
- [ ] 记录现场 PLC 的 IP、端口、站号，写进第 8 章记录单

### 3.3 上位机侧

- [ ] Node.js ≥ 20.19（本机 v26.3.0），`node_modules` 已安装
- [ ] `3000` 端口未被占用（平台 Web/API 端口）
- [ ] 浏览器可访问 `http://127.0.0.1:3000` 并返回 200（本机实测：`GET / -> 200`）

### 3.4 平台配置核对（最关键的一步）

打开 `D:\realtime-platform\realtime-platform-main\.env`，逐项核对：

| 项目 | 模拟器闭环（当前） | 真实 PLC（现场） |
|---|---|---|
| `PLC_MODE` | `real` | `real`（不变） |
| `PLC_HOST` | `127.0.0.1` | **现场 PLC 实际 IP** |
| `PLC_PORT` | `1502` | `502` |
| `PLC_UNIT_ID` | `1` | 与 AutoShop MBS 站号一致 |
| `PLC_INTERVAL` | `2000` | `1000`–`2000` |
| 寄存器段 | `30001`–`30022` | **必须与 PLC 程序实际段一致** |

**寄存器段对照（最容易错，错一位则数据全乱）：**

| 寄存器 | 标准型 H5U（参考程序注释的备用段） | **H5U Easy 段（参考程序默认，现场多用）** |
|---|---|---|
| 温度 / 压力 / 湿度 | 30001 / 30002 / 30003 | 2001 / 2002 / 2003 |
| 状态字 / 序号 | 30004 / 30005 | 2004 / 2005 |
| 子包段 | 30011 | 2011 |
| 写回（力 / 高度） | 30021 / 30022 | 2021 / 2022 |

若现场下载的就是 `H5U_main.st` 这份参考程序，`.env` 必须整段改成 `2001` 段；只有标准型 H5U 且程序确实用了 `D30001` 段，才保留默认值。

### 3.5 标定与阈值联动（接真机前必读）

- 平台侧阈值在 `plc-packet.js` 的 `THRESHOLDS`（高温 80 °C / 低温 −10 °C / 高压 1000 kPa / 低压 100 kPa / 高湿 85 %），**必须与 PLC 程序内判阈一致**，改任何一侧都要同步另一侧。
- 接触力模型 `F = p × A_eff − F_offset`（EN 50367）。默认 `PANTO_A_EFF=0.001`、`PANTO_F_TARGET=100` ⇒ 目标压力恰好落在低压阈值 100 kPa 上。**本机闭环实测**已复现该现象：力环收敛到 87.3 kPa 时，模拟器连续输出

  ```
  [主包] seq=502 温度=25.0°C 压力=93.20kPa 湿度=45.7% 状态=0xC2  ⚠️ 位图=0b010 子包已写入
  ```

  即触发"低压"子包异常。**真机 A_eff 往往远大于 0.001**，工作压力可能只有几 kPa～几十 kPa，会持续报低压报警。处理办法：把 `THRESHOLDS.pressLow`、PLC 程序判阈、`PANTO_F_TARGET` 三者一起按现场标定值调整，不要只改一个。
- `PANTO_TAU_FORCE` / `PANTO_TAU_HEIGHT` / `PANTO_DEADTIME_MS` 默认值按模拟器整定，真机对象应在稳定后重新做一次 Z-N 阶跃整定获取（见 4.4）。
- 阈值标定未完成前，**不要开启自动调节**，只做只读接入。

### 3.6 数据库（真实模式建议启用，本机已启用）

真实模式会尝试初始化 Prisma（MySQL 持久化）。**本机已配置完成并验证落库**，配置信息如下：

| 项目 | 值 |
|---|---|
| MySQL 版本 | 9.7.0（Windows 服务名 `MySQL97`，自启动） |
| 监听地址 | `127.0.0.1:3306` |
| 数据库名 | `realtime_platform`（`utf8mb4` / `utf8mb4_unicode_ci`） |
| 平台账号 | `rtp` / `你的强口令`（仅授权 `realtime_platform.*`，非 root） |
| 连接串 | `mysql://rtp:你的强口令@127.0.0.1:3306/realtime_platform` |
| 表 | `warning_history`、`over_limit_snapshot`、`users` |

> ⚠️ 上述口令为本机开发环境口令，**上线到服务器必须更换强口令**（见《云服务器部署方案》），并且 `.env` 不得提交进 git。

**在另一台机器上从零配置数据库的完整步骤：**

1. 建库建账号（用 MySQL 管理账号执行一次）：
   ```sql
   CREATE DATABASE realtime_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'rtp'@'localhost' IDENTIFIED BY '你的强口令';
   CREATE USER 'rtp'@'127.0.0.1' IDENTIFIED BY '你的强口令';
   GRANT ALL PRIVILEGES ON realtime_platform.* TO 'rtp'@'localhost';
   GRANT ALL PRIVILEGES ON realtime_platform.* TO 'rtp'@'127.0.0.1';
   FLUSH PRIVILEGES;
   ```
2. 在 `.env` 增加连接串（本机已加）：
   ```ini
   DATABASE_URL=mysql://rtp:你的强口令@127.0.0.1:3306/realtime_platform
   ```
3. 安装 Prisma CLI 并生成客户端（项目原本**只装了 `@prisma/client`，没有装 CLI，也没有生成过客户端**，这一步不能省）：
   ```bash
   npm install --save-dev prisma@5.22.0
   npx prisma generate --schema prisma/schema.prisma
   ```
   注意：新版 npm 默认不执行依赖的安装脚本，可能提示 `packages have install scripts not yet covered by allowScripts`。
   **这不影响使用**——`prisma generate` 会自行下载引擎（本机生成后可见 `node_modules/.prisma/client/query_engine-windows.dll.node`，约 19 MB）。
4. 建表（项目没有 migrations 目录，用 `db push`）：
   ```bash
   npx prisma db push --schema prisma/schema.prisma
   # 期望：Your database is now in sync with your Prisma schema.
   ```
5. **重启平台**（数据库只在启动瞬间加载，见事实 2）。

**本机验证结果（实测）**：模拟器注入高温异常后，平台连续产生告警，`GET /api/history` 返回 9 条、数据库直查 `SELECT COUNT(*) FROM warning_history` 同为 9 条；重启平台后日志打印 `✅ 当前加载 9 条记录`，`/api/stats/trend`、`/api/stats/distribution` 均能从库中正确聚合，中文内容无乱码。

### 3.7 现场安全底线

- **先只读、后写回**：第一次接真机只采集、不开自动，任何写回都要在只读核对通过之后。
- **不在生产运行中做整定**：Z-N 整定会施加 10 % 量程的阶跃，属扰动性试验。
- **保留回滚路径**：改 `.env` 前先备份（本机已有 `.env.bak.*` 先例），并确认现场可随时退回模拟器闭环。

---

## 4 四步切换法（每步都有通过判据）

> 命令默认在 `D:\realtime-platform\realtime-platform-main` 目录执行。
> Windows PowerShell 中 `curl` 是 `Invoke-WebRequest` 的别名，请用 `curl.exe` 或 `Invoke-RestMethod`。

### 第一步：模拟器闭环自检（无需任何 PLC）

**目的**：先证明"这台机器上的 real 模式整条链路"是通的，把平台侧问题一次性排干净。

1. 启动 PLC 协议模拟器（推荐双击 `启动PLC模拟器（双击这里）.bat`，或命令行）：

   ```bash
   node plc-simulator.js --port 1502 --interval 100
   ```

   期望输出（**本机实测**）：

   ```
   ============================================
     汇川 H5U PLC 模拟器（Modbus TCP 从站）
     监听: 0.0.0.0:1502  从站号: 1
     采样周期: 100ms  滑窗: 10 条
     主包: 30001-30005  子包: 30011-30015  写回: 30021-30022
     平台 .env 设置: PLC_MODE=real PLC_HOST=127.0.0.1 PLC_PORT=1502
   ============================================
   ✓ 已就绪，等待平台连接（Ctrl+C 退出）
   ```

2. 另开一个终端启动平台：

   ```bash
   npm start
   ```

3. **通过判据**（**本机实测**）：

   ```
   ✅ Server running on http://localhost:3000
   📡 WebSocket 服务已启动
   ✅ 汇川 PLC 连接成功 (127.0.0.1:1502)
   ✅ 切换到真实PLC模式
   ```

   ```
   GET /api/plc/mode    → {"mode":"real"}
   GET /api/plc/packet  → temperature 25.0  pressure 248.1  humidity 44.7
                          status 64(0x40)  seq 202  extended true  subValid false
   ```

   页面（受电弓监测页）应显示 **PLC 实时数据** 标签且序号每秒递增。
   ⚠️ 若此时看到 `⚠️ 真实PLC连接失败，自动切换到模拟模式`，说明第一步就没通，回到第 7 章排查，**不要**进入第二步。

### 第二步：接真机只读（不开自动）

1. 停掉平台（`Ctrl+C`），停掉模拟器（可选，留着不影响，但会占 1502 端口）。
2. 备份并修改 `.env`：`PLC_HOST` → 现场 PLC IP，`PLC_PORT` → `502`，`PLC_REG_*` → 与 PLC 程序一致。
3. **先用 Modbus 工具独立核对**（不经过平台）：读 `4x2001`–`4x2005`（或 `30001` 段），确认
   - 温度/压力/湿度数值合理、平稳；
   - 状态字 `bit6=0x40`；
   - 序号每秒递增（65535 后回绕到 1，0 保留给旧固件）。
4. 启动平台，只观察、**不开自动**：

   ```bash
   npm start
   curl.exe http://localhost:3000/api/plc/packet
   ```

5. **通过判据**：平台读数与 Modbus 工具读数**逐项一致**，`/api/plc/mode` 返回 `real`，页面出现"PLC 实时数据"。**不一致就不要进入第三步**，先查寄存器段与缩放系数。

### 第三步：小步开启写回闭环

1. 先只开力环：

   ```bash
   curl.exe -X POST http://localhost:3000/api/control/auto -H "Content-Type: application/json" -d "{\"loop\":\"force\",\"enabled\":true}"
   ```

2. 观察模拟器/PLC 侧是否收到写值。**本机实测**模拟器日志：

   ```
   ◀ 收到 FC16 写: 30021 接触力环输出=217.30kPa
   ◀ 收到 FC16 写: 30022 姿态环输出=1800mm
   [执行机构] 压力设定=217.30kPa → 当前=242.60kPa, 高度设定=1800mm → 当前=1800mm
   ```

   平台侧测量值随动下降（**本机实测**，目标 100 kPa，从 252.5 起调）：

| 时刻 | 测量值 | 输出 | 说明 |
|---|---|---|---|
| t=0 s | 252.5 kPa | 250 | 开环初值 |
| t=4 s | 212.7 kPa | 50 | 输出打到下限（钳位生效） |
| t=10 s | 125.9 kPa | 87.33 | 继续收敛 |

3. 力环平稳收敛后，再开姿态环；有振荡先按第 7 章降增益，不要一次开两个环。
4. **通过判据**：比例阀/执行机构动作平稳，测量无持续振荡，页面曲线无锯齿；真机用 Modbus 工具读 `4x2021`/`4x2022` 能读到平台写入值。

### 第四步：标定、整定与异常联调

1. **静态标定**：升弓到几个已知压力点，实测接触力，拟合 `F = p × A_eff − F_offset`，把 `PANTO_A_EFF` / `PANTO_F_OFFSET` 写回 `.env`；测杆长校准 `PANTO_L1` / `PANTO_L2` / `PANTO_THETA_RATIO`。
2. **Z-N 整定**（必须先稳态，且不在生产运行中做）：先后对力环、姿态环各做一次
   ```bash
   curl.exe -X POST http://localhost:3000/api/control/tune -H "Content-Type: application/json" -d "{\"loop\":\"force\"}"
   ```
   若报"纯滞后占比过大"（T ≤ L），说明对象滞后主导，改用保守手工参数（Kp 减半、Ki 再减半起步）。
3. **异常联调**：人为制造真实异常（断一路传感器线 → 低压报警；堵比例阀 → 压力异常），确认平台告警与现场现象一致。
4. **通过判据**：告警内容、等级、时间与现场一一对应；解除后状态能正常复位。

---

## 5 切换后验证清单

| # | 验证项 | 命令 / 位置 | 预期结果 | 本机实测 |
|---|---|---|---|---|
| 1 | 模式查询 | `curl.exe http://localhost:3000/api/plc/mode` | `{"mode":"real"}` | `{"mode":"real"}` ✔ |
| 2 | 启动日志 | 平台终端 | `✅ 汇川 PLC 连接成功` + `✅ 切换到真实PLC模式` | 一致 ✔ |
| 3 | 页面数据源 | 受电弓监测页 | "PLC 实时数据"标签 + seq 递增 | 一致 ✔ |
| 4 | 传感器数值 | 页面传感器卡 | 平稳合理，非随机跳变 | 温度 25.0 / 压力 248.1 / 湿度 44.7 ✔ |
| 5 | 原始报文 | `curl.exe http://localhost:3000/api/plc/packet` | `status` 含 bit6（0x40/0xC1/0xC2），`seq` 递增 | status 64 = 0x40，seq 202 ✔ |
| 6 | 子包链路 | 注入异常后看 `/api/plc/packet` | `subValid=true`、位图非 0、告警列表新增 | 力环收敛至 87.3 kPa 时出现 `状态=0xC2 位图=0b010` ✔ |
| 7 | 控制写回 | 模拟器日志 / Modbus 工具读 4x2021 | 出现 `◀ 收到 FC16 写: 30021 …` | 已实测，见 4.3 ✔ |
| 8 | 控制状态 | `curl.exe http://localhost:3000/api/control/status` | 双环 target/measurement/output 合理 | force 目标 100，输出钳位区间 50–1000 ✔ |
| 9 | 数据库落库 | `curl.exe http://localhost:3000/api/history` | 重启后告警仍在 | 已配置并实测：重启后 `✅ 当前加载 9 条记录` ✔ |
| 10 | 断线恢复 | 运行中停 PLC，观察日志 | 每档打印重试提示，恢复后自动续采 | 退避 2 s 起步、30 s 封顶 ✔ |

---

## 6 运行时临时切换与回滚

### 6.1 临时切换（不重启）

```powershell
# 查当前模式
curl.exe http://localhost:3000/api/plc/mode

# 切到真实模式（连不上会自动回退模拟，不报错、不重试）
curl.exe -X POST http://localhost:3000/api/plc/mode -H "Content-Type: application/json" -d "{\"mode\":\"real\"}"

# 切回纯模拟
curl.exe -X POST http://localhost:3000/api/plc/mode -H "Content-Type: application/json" -d "{\"mode\":\"simulation\"}"
```

或直接在受电弓监测页点"模拟/真实"切换按钮（内部就是调上面的接口）。

> 限制：重启后回到 `.env` 的值；启动时若是 `simulation`，运行中切到 `real` 也**不会**加载数据库。

### 6.2 回滚

- **退回模拟器闭环**：`.env` 改 `PLC_HOST=127.0.0.1`、`PLC_PORT=1502`、`PLC_MODE=real`，重启平台，并启动模拟器。
- **退回纯模拟**：`.env` 改 `PLC_MODE=simulation`，重启平台。
- **清掉模拟产生的内存告警**：`DELETE /api/simulation/clear`（只清内存中 `PLC_SENSOR` 记录，不动数据库）。

### 6.3 停服顺序

先停平台，再停模拟器/断开 PLC 连接，避免平台日志刷屏重连提示。

### 6.4 启用了写接口令牌时，上面的命令怎么改

v1.2 起平台内置写接口保护。若 `.env` 里设了 `API_TOKEN`（非空即启用），则**所有写操作**（POST/DELETE）
都必须带令牌，本手册第 4、6 章的 `curl.exe -X POST ...` 命令需要补一个请求头：

```powershell
curl.exe -X POST http://localhost:3000/api/control/auto `
  -H "Content-Type: application/json" -H "X-API-Token: 你的令牌" `
  -d "{\"loop\":\"force\",\"enabled\":true}"
```

要点：

- 只读的 GET（`/api/plc/mode`、`/api/plc/packet`、`/api/control/status` 等）**不需要令牌**，切换前核查不受影响。
- 不带令牌的写请求会返回 **401**；请求过快会返回 **429**（响应头 `Retry-After` 给出等待秒数）。
- 浏览器页面里的控制按钮同样会被拦，现场调试建议**临时清空 `API_TOKEN` 并重启平台**，投产前再由反向代理注入令牌。
- 查看当前策略与审计：`curl.exe http://localhost:3000/api/v2/security`、`curl.exe http://localhost:3000/api/v2/audit`。

---

## 7 故障排查对照表

| # | 现象 | 根本原因 | 处理 |
|---|---|---|---|
| 7.1 | 切了 real，页面仍是"模拟数据" | PLC 连不上，平台自动回退且**不自动重试**（事实 3） | 看日志里的具体失败原因，修好后**再切一次**或重启 |
| 7.2 | 重启后回到模拟模式 | `.env` 仍是 `simulation`，或改的是容器环境变量未重建容器 | 确认 `.env` 已改；Docker 场景 `docker compose up -d app` |
| 7.3 | 改了 `.env` 地址，运行时切换仍连旧地址 | 运行时切换不重读 `.env`（事实 1） | 必须重启平台 |
| 7.4 | 数据全 0 | D 区映射错误 / 旧固件路径 | Modbus 工具直接读核对；查状态字 bit6 是否为 `0x40` |
| 7.5 | 读数错位一位 | 寄存器段不一致（`30001` vs `2001`），或工具加了 `40001` 偏移 | 统一段号；协议原地址不加偏移 |
| 7.6 | 数值差 10 倍 | PLC 程序与平台缩放不一致（×10 vs ×100） | 统一 ×10（压力用 ×10，×100 在 1000 kPa 会溢出 uint16） |
| 7.7 | 无子包 | PLC 侧异常未触发 / bit7 未置 | 人为触发异常，读位图寄存器确认 |
| 7.8 | 写回无效（页面有输出、阀不动） | `4x2021/2022` 未映射到 D 区，或 PLC 程序未读回 | 用 Modbus 工具手写 `4x2021`，看比例阀是否动作 |
| 7.9 | 切 real 后告警不落库 | 没配 `DATABASE_URL`，或 Prisma 客户端从未生成 | 补连接串 + `npx prisma generate` + `npx prisma db push` + 重启 |
| 7.10 | 启动报 `PrismaClient did not initialize yet` | 项目只装了 `@prisma/client`，没跑过 `prisma generate` | 安装 `prisma` CLI 并执行 `npx prisma generate`（见 3.6 第 3 步） |
| 7.11 | Prisma 连接报错 | 连接串 host 写错（容器内要写服务名而非 localhost） | 按部署文档核对连接串 |
| 7.12 | 闭环中偶发"低压报警" | 目标压力压在低压阈值 100 kPa 上（3.5 已实测复现） | 同步调整阈值与目标值 |
| 7.13 | 整定失败（K/T/L 非法、响应无变化、超时） | 执行机构未就绪；阶跃被写回钳位；对象滞后过大 | 确认手动输出有效后再整定；`ZN_DEBUG=1` 看拟合过程；T ≤ L 时改保守手工参数 |
| 7.14 | 整定后回路振荡 | Z-N 增益对滞后主导对象偏激进 | Kp×0.7、Ki×0.5 起步微调 |
| 7.15 | 页面显示"旧固件回退" | 状态字 bit6=0 且序号=0 | 属正常回退路径；确认 PLC 置位 `0x40` 或等序号递增 |
| 7.16 | 平台连不上 1502 | 模拟器未启动 / 端口被占用 / `.env` 的 `PLC_PORT` 未指向 1502 | 用 `tools/plc-sim-doctor.ps1` 体检，或查端口占用进程 |
| 7.17 | 界面不更新 | 浏览器缓存旧前端 | 构建前端后重启平台并强刷（Ctrl+F5） |

**本机实测的两种典型失败日志原文**（可直接比对）：

```
# 情况一：PLC 完全连不上
❌ 汇川 PLC 连接失败 (connect ECONNREFUSED 127.0.0.1:1502)
⚠️ 真实PLC连接失败，自动切换到模拟模式

# 情况二：无数据库
⚠️ Prisma 加载失败，将以无数据库模式运行
ℹ️ 跳过数据库加载（模拟模式），使用内存数据
```

---

## 8 上线变更管理与现场作业记录单

现场切换属于"变更作业"，建议每次填写并留档（可直接抄下表打印）。

| 项目 | 内容 |
|---|---|
| 作业日期 / 时间 | |
| 作业地点 / 站名 | |
| 作业人 / 监护人 | |
| 变更前模式 | □ 纯模拟　□ 模拟器闭环　□ 真实 PLC |
| 变更后模式 | □ 纯模拟　□ 模拟器闭环　□ 真实 PLC |
| PLC 型号 / IP / 端口 / 站号 | |
| 寄存器段 | □ 30001 段　□ 2001 段　□ 其他： |
| 是否配置数据库 | □ 否　□ 是（连接串：　　　　） |
| 是否执行标定 | □ 否　□ 是（A_eff = 　　　F_offset = 　　） |
| 是否执行 Z-N 整定 | □ 否　□ 是（力环 Kp/Ki/Kd = 　　；姿态环 = 　　） |
| 验证清单通过项 | ___ / 10（见第 5 章） |
| 异常与处理 | |
| 回滚记录 | |
| 签字 / 日期 | |

**作业前口头确认三句**：只读核对通过了吗？自动调节先只开了一个环吗？回滚方式现场知道吗？

---

## 9 附录

### 9.1 附录 A：寄存器映射表

| 寄存器（Easy 段 / 标准段） | 方向 | 语义 | 缩放 |
|---|---|---|---|
| 2001 / 30001 | PLC → 平台 | 温度均值 | ×10，有符号 16 位 |
| 2002 / 30002 | PLC → 平台 | 压力均值 | ×10（0.1 kPa） |
| 2003 / 30003 | PLC → 平台 | 湿度均值 | ×10 |
| 2004 / 30004 | PLC → 平台 | 状态字：bit0/1/2 = 温/压/湿异常，bit6 = `0x40` 扩展协议，bit7 = `0x80` 子包有效 | — |
| 2005 / 30005 | PLC → 平台 | 主包序号（65535 → 1 回绕，0 保留） | — |
| 2011 / 30011 | PLC → 平台 | 子包序号（= 异常发生时的主包序号） | — |
| 2012 / 30012 | PLC → 平台 | 异常位图（bit0-2 同状态字） | — |
| 2013–2015 / 30013–30015 | PLC → 平台 | 子包异常值（温度/压力/湿度） | 同上 |
| 2021 / 30021 | 平台 → PLC | 接触力环输出 = 气囊压力设定 | ×10 kPa |
| 2022 / 30022 | 平台 → PLC | 姿态环输出 = 弓头高度设定 | mm |

### 9.2 附录 B：`.env` 参考模板

**模板一：模拟器闭环（当前本机配置，无需 PLC）**

```ini
PLC_MODE=real
PLC_HOST=127.0.0.1
PLC_PORT=1502
PLC_UNIT_ID=1
PLC_INTERVAL=1000
PLC_REG_TEMP=30001
PLC_REG_PRESS=30002
PLC_REG_HUMID=30003
PLC_REG_STATUS=30004
PLC_REG_SEQ=30005
PLC_REG_SUB_BASE=30011
PLC_REG_WRITE_FORCE=30021
PLC_REG_WRITE_HEIGHT=30022
DATABASE_URL=mysql://rtp:你的强口令@127.0.0.1:3306/realtime_platform
```

**模板二：现场真实 H5U（Easy 型，D2001 段）**

```ini
PLC_MODE=real
PLC_HOST=192.168.1.88        # 改成现场 PLC 实际 IP
PLC_PORT=502
PLC_UNIT_ID=1
PLC_INTERVAL=2000
PLC_REG_TEMP=2001
PLC_REG_PRESS=2002
PLC_REG_HUMID=2003
PLC_REG_STATUS=2004
PLC_REG_SEQ=2005
PLC_REG_SUB_BASE=2011
PLC_REG_WRITE_FORCE=2021
PLC_REG_WRITE_HEIGHT=2022
DATABASE_URL=mysql://用户名:密码@127.0.0.1:3306/realtime_platform
```

### 9.3 附录 C：API 速查

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/plc/mode` | 查当前模式（simulation / real） |
| POST | `/api/plc/mode` | 切换模式 `{"mode":"real"}` / `{"mode":"simulation"}` |
| GET | `/api/plc/packet` | 最近一次主/子包原始报文（排错首选） |
| GET | `/api/control/status` | 双环 PID 状态（目标/测量/输出/增益/整定） |
| POST | `/api/control/params` | 手工设参 `{loop, kp, ki, kd, target}` |
| POST | `/api/control/auto` | 自动调节开关 `{loop, enabled}` |
| POST | `/api/control/tune` | 启动 Z-N 整定 `{loop}` |
| POST | `/api/control/tune/cancel` | 取消整定 |
| GET | `/api/history` | 告警历史 |
| DELETE | `/api/simulation/clear` | 清内存中 `PLC_SENSOR` 告警 |

### 9.4 附录 D：一页速记

```
① 模拟器闭环自检：启动模拟器(1502) + npm start → 看到"✅ 切换到真实PLC模式"才算通
② 改 .env：PLC_HOST=现场IP  PLC_PORT=502  PLC_REG_*=PLC程序段  → 备份先！
③ 重启平台（必须），Modbus 工具先只读核对，再开自动
④ 先力环、后姿态环；先标定阈值、再整定；生产运行中不整定
⑤ 切 real 连不上 → 自动回退模拟且不重试 → 修好后"再切一次"
⑥ 回滚：.env 改回 127.0.0.1:1502（模拟器闭环）或 PLC_MODE=simulation（纯模拟）
⑦ 数据库：本机已配好（realtime_platform / 账号 rtp），改 .env 后同样必须重启才生效
```

---

*本手册与代码同步维护；`server.js`、`plc-packet.js`、`control-engine.js` 行为变更时请同步更新本手册对应章节。*
