# 受电弓碳滑板实时监测与运维平台

面向城市轨道交通**受电弓碳滑板**的在线监测、异常告警与接触状态主动调控平台。
前端 Vue 3 大屏 + 后端 Express/Socket.IO 一体部署，通过 **Modbus TCP** 采集汇川 H5U PLC 的环境与受电弓数据，内置**双环 PID 主动控制**、**健康评估与工单闭环**。

> 技术栈：Vue 3 · Vite · Element Plus · ECharts · DataV｜Express · Socket.IO · Prisma/MySQL · modbus-serial

---

## 一、功能特性

| 模块 | 能力 |
|---|---|
| 实时监测 | 温度 / 压力 / 湿度三路采集，实时曲线、仪表盘、线路/单车/全局多级视图，Socket.IO 推送 |
| 异常告警 | 越限告警 + **变化率预警**，分级（warning / major / critical），确认与解除留痕，10 s 去重抑制 |
| 主动控制 | 双环 PID（接触力环 + 姿态环）自动调节，参数下发与 **Z-N 阶跃整定**，安全预设折减 |
| 健康与检修 | 健康指数与四档检修建议，严重告警自动生成工单，指派→开工→完成→复核状态机与审计轨迹 |
| 链路监测 | 序号缺口/丢包率、数据新鲜度质量码（GOOD/STALE/BAD）、写回读校验、断线退避重连 |
| 数据资产 | 告警历史入库、超限快照、现场照片上传、PDF 报告导出 |
| 安全与审计 | 写接口令牌校验、按 IP 令牌桶限流、操作审计、上传白名单、安全响应头 |
| 标准符合性 | 目标接触力与动态限值按 EN 50367 / TB/T 3271 公开形式实现，可在 `standards.js` 覆盖 |

---

## 二、目录结构

```
realtime-platform/
├── server.js                 # 后端入口：采集、告警、控制、上传、PDF 导出、静态托管
├── security.js               # 写接口令牌校验 / 频率限制 / 操作审计 / 上传白名单
├── plc-packet.js             # 主包/子包解析、阈值单一来源
├── plc-simulator.js          # 汇川 H5U 协议级模拟器（Modbus TCP 从站）
├── control-engine.js         # 双环 PID + Z-N 整定（运行引擎）
├── control-engine-v2.js      # v2 安全整定：微分滤波 / 积分分离 / 设定值斜坡 / 增益调度
├── standards.js              # EN 50367 / TB/T 3271 标准公式与指标
├── alarm-engine.js           # 变化率预警、分级告警、确认/解除
├── link-monitor.js           # 丢包率、质量码、退避重连、写回读校验
├── maintenance.js            # 健康指数、工单流转、MTTR
├── upgrade-routes.js         # /api/v2 路由（挂载于 server.js）
├── src/                      # Vue 3 前端源码
├── dist/                     # 前端构建产物（由 Express 托管，已入库便于直接部署）
├── prisma/schema.prisma      # MySQL 数据模型
├── plc-program/H5U_main.st   # AutoShop ST 参考程序（Easy 型 D2001 段）
├── tests/run-tests.js        # 无依赖自测（51 项）与指标报告
├── tools/                    # 模拟器体检 / 冒烟脚本
├── docs/                     # 全部文档（见第九节索引）
└── 启动PLC模拟器.bat          # 模拟器菜单式启动器（Windows）
```

---

## 三、快速开始

### 1. 环境要求

| 项目 | 要求 |
|---|---|
| Node.js | `^20.19.0` 或 `>=22.12.0`（建议 22 LTS） |
| 数据库 | MySQL 5.7 / 8.0 / 9.x（可选，未配置则平台以无数据库模式运行） |
| 端口 | 平台 `3000`、PLC Modbus TCP `502`、模拟器 `1502`、相机 RTSP `554` |

### 2. 安装

```bash
git clone git@github.com:Mono-creater/realtime-platform.git
cd realtime-platform
npm install
```

### 3. 配置（最小可用：无 PLC 也能跑通全链路）

```bash
copy .env.example .env
```

无硬件时把 `.env` 配成**模拟器闭环**即可（模拟器在协议层忠实模拟 H5U，平台无法区分它与真机）：

```ini
PLC_MODE=real
PLC_HOST=127.0.0.1
PLC_PORT=1502
PLC_INTERVAL=1000
```

### 4. 启动

```bash
# 终端 1：启动 PLC 协议模拟器（Windows 也可双击 启动PLC模拟器.bat）
npm run plc-sim

# 终端 2：启动平台（前后端一体）
npm start
```

浏览器打开 **http://127.0.0.1:3000**，页面出现"**PLC 实时数据**"标签与递增序号即为链路正常。

### 5. 验证

```bash
node tests/run-tests.js          # 51 项自测（标准公式/控制对比/告警/链路/工单/安全）
node tools/plc-sim-smoke.js      # 端到端冒烟：读主包/子包、写回读校验
curl.exe http://127.0.0.1:3000/api/plc/packet
```

---

## 四、三种运行模式

| 模式 | `PLC_MODE` | `PLC_HOST` / `PLC_PORT` | 数据来源 | 页面标签 |
|---|---|---|---|---|
| 纯模拟 | `simulation` | — | 平台自生成随机数 | 模拟数据 |
| **模拟器闭环** | `real` | `127.0.0.1` / `1502` | `plc-simulator.js` | PLC 实时数据 |
| 真实 PLC | `real` | 现场 PLC IP / `502` | 汇川 H5U 实体机 | PLC 实时数据 |

要点：

- 模拟器闭环与真实 PLC 走**同一套 Modbus 报文与寄存器语义**，切换只需改 `PLC_HOST` / `PLC_PORT`。
- 改 `.env` **必须重启**平台；运行时 `POST /api/plc/mode` 切换不重读 `.env`，重启后失效。
- 连接失败会**自动回退模拟模式且不自动重试**，修好后需再切一次。

> 现场切换（接线、AutoShop、寄存器段、标定、Z-N 整定、作业记录单）详见 `docs/切换真实PLC操作手册.md`。

---

## 五、数据库（可选）

未配置 `DATABASE_URL` 时平台以**无数据库模式**运行：功能正常，但告警历史、用户登录不落库。

```sql
CREATE DATABASE realtime_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'rtp'@'127.0.0.1' IDENTIFIED BY '你的强口令';
GRANT ALL PRIVILEGES ON realtime_platform.* TO 'rtp'@'127.0.0.1';
FLUSH PRIVILEGES;
```

```ini
DATABASE_URL=mysql://rtp:你的强口令@127.0.0.1:3306/realtime_platform
```

```bash
npm install --save-dev prisma@5.22.0     # 工程原本只有 @prisma/client，CLI 需单独安装
npx prisma generate                      # 必做：生成客户端与查询引擎
npx prisma db push                       # 工程无 migrations 目录，用 db push 建表
npm start                                # 重启后生效
```

启动日志出现 `✅ Prisma Client 已初始化` → `✅ 当前加载 N 条记录` 即为落库成功。
表：`warning_history`、`over_limit_snapshot`、`users`。

---

## 六、写接口安全与审计（v2 加固）

`security.js` 只保护**写操作**（POST/PUT/PATCH/DELETE），只读 GET 一律放行；默认配置**不改变现网行为**。

| 能力 | 行为 | 相关环境变量 |
|---|---|---|
| 令牌校验 | `API_TOKEN` 非空即启用；请求需带 `X-API-Token` 或 `Authorization: Bearer` | `API_TOKEN` |
| 频率限制 | 按来源 IP 令牌桶，超配额返回 `429` + `Retry-After` | `RATE_LIMIT_PER_MIN`（默认 120） |
| 操作审计 | 环形缓冲记录写操作（时间/IP/方法/路径/状态码/耗时），`GET /api/v2/audit` 查询 | `AUDIT_LIMIT`（默认 500） |
| 上传白名单 | 扩展名白名单，阻断 `.html/.js/.svg` 等可执行载荷；超限返回 `413` | `UPLOAD_ALLOWED_EXT`、`UPLOAD_MAX_MB` |
| 跨域收敛 | 配置后仅放行指定来源，留空保持原宽松行为 | `CORS_ORIGIN` |
| 安全响应头 | `X-Content-Type-Options` / `Referrer-Policy` | `SECURITY_HEADERS` |
| 增益上限 | PID 增益超过 `PID_GAIN_LIMIT`（默认 100）直接拒绝 | `PID_GAIN_LIMIT` |

```bash
# 启用令牌后：
curl.exe -X POST http://127.0.0.1:3000/api/control/auto \
  -H "X-API-Token: <你的令牌>" -H "Content-Type: application/json" \
  -d "{\"loop\":\"force\",\"enabled\":true}"

# 查看审计与安全状态
curl.exe "http://127.0.0.1:3000/api/v2/audit?limit=20"
curl.exe http://127.0.0.1:3000/api/v2/security
```

> ⚠️ 启用 `API_TOKEN` 后，浏览器端调用写接口也会被拦，需由**反向代理注入该请求头**，或把只读查询与控制操作分离部署。

---

## 七、接口概览

### 业务接口（`server.js`）

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/test` | 服务自检 |
| GET | `/api/stats/summary` `/trend` `/distribution` | 统计概要、趋势、分布 |
| GET | `/api/history` | 告警历史 |
| POST | `/api/alert` | 新增告警 |
| GET/DELETE | `/api/warning/:id` | 告警详情 / 删除 |
| DELETE | `/api/warnings` | 批量/清空 |
| POST | `/api/upload` | 现场照片上传（字段 `file`） |
| GET | `/api/export/pdf/:id` | 导出告警 PDF 报告 |
| GET/POST | `/api/plc/mode` | 运行模式查询 / 切换 |
| GET | `/api/plc/packet` | 最近一次主/子包原始报文 |
| GET | `/api/control/status` | 双环 PID 状态 |
| POST | `/api/control/params` `/auto` `/tune` `/tune/cancel` | 设参 / 自动开关 / 整定 |

### 升级接口（`/api/v2`，由 `upgrade-routes.js` 提供）

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/v2/standards/force-target?v=&system=` | 目标平均接触力与动态限值 |
| GET | `/api/v2/standards/check?v=&mean=&std=` | 接触力一致性校验 |
| POST | `/api/v2/ingest` | 采样上报（驱动告警引擎与链路监视，可自动建单） |
| GET | `/api/v2/alarms`｜POST `/alarms/:id/ack` `/clear` | 告警列表 / 确认 / 解除 |
| GET | `/api/v2/link` | 链路质量（丢包率、质量码、退避） |
| GET/POST | `/api/v2/orders`｜POST `/orders/:id/:action` | 工单查询、创建与流转 |
| GET | `/api/v2/health` | 健康指数与检修建议 |
| GET | `/api/v2/kpi` | 可用率、数据完整率、告警时延、MTTR |
| GET | `/api/v2/audit` | **操作审计与安全计数** |
| GET | `/api/v2/security` | **当前安全策略状态** |

---

## 八、测试与自检

```bash
npm run lint                  # oxlint + eslint（含 --fix）
node tests/run-tests.js       # 51 项自测，输出 tests/report.json
node tools/plc-sim-smoke.js   # 模拟器端到端冒烟（需先启动模拟器）
powershell -File tools/plc-sim-doctor.ps1 -Fix   # 模拟器启动失败体检与清理
```

覆盖范围：标准公式、控制器 v1/v2 对比、告警时延与误报抑制、链路质量与写回读校验、工单闭环与健康分级、写接口安全加固。

---

## 九、文档索引（`docs/`）

| 文档 | 内容 |
|---|---|
| `切换真实PLC操作手册.md` | **推荐先读**：三种模式与切换原理、四步切换法、验证清单、回滚、现场作业记录单 |
| `平台使用操作手册.md` | 平台总手册：安装配置、界面操作、控制、告警工单、备份、排错、安全与 v2 模块 |
| `平台技术与模型公式总结.md` | 技术栈与全部模型公式（含出处） |
| `开发者二次开发指南.md` | 目录结构、模块扩展、接口与前端改造指引 |
| `一线检修速查卡.docx` / `.pdf` | 现场两页速查卡（告警分级、自检、处置） |
| `PLC接入操作手册.md` | H5U 接线、AutoShop 配置、寄存器映射、报文协议、联调 |
| `模拟切换真实模式操作文档.md` | 模拟/真实模式切换的代码事实与注意事项 |
| `云服务器部署方案.md` | 服务器选型、Docker、MySQL、frp 隧道、视频回传、成本 |
| `UPGRADE.md` | v2 优化升级的需求对照、改动与测试结果 |
| `切换模式流程示意图.html` | 模式切换流程图 |
| `server.js.full.txt` | 后端全文快照（便于检索比对） |

> 各手册同时提供 `.docx` / `.pdf` 版本，便于打印与评审。

---

## 十、部署

```bash
npm run build     # 前端构建到 dist/
npm start         # 生产启动（node server.js，端口 3000）
```

```bash
# Docker
docker build -t realtime-platform .
docker run -d --name rtp -p 3000:3000 --env-file .env \
  -v /data/uploads:/app/uploads realtime-platform
```

- `uploads/` 必须挂载持久化卷，否则容器重建会丢照片。
- 工程自带 `Dockerfile`（node:22-alpine）、`railway.json`、`nixpacks.toml`，**应用需位于仓库根目录**。
- 云服务器选型、带宽与视频回传、frp 隧道打通现场 PLC 与相机的完整方案见 `docs/云服务器部署方案.md`。
- ⚠️ **Modbus(502) / RTSP(554) 不得直接暴露公网**，必须走隧道或 VPN。

---

## 十一、说明

- 标准系数（`Fm = 0.000 97·v² + 70` 等）按 EN 50367 / TB/T 3271 的**公开形式**实现，落地前须按项目采用的标准版本复核，可在 `standards.js` 覆盖。
- 接触力模型 `F = p × A_eff − F_offset` 中 `A_eff` / `F_offset` **必须现场实测标定**；默认值下目标压力恰好落在低压报警阈值上，闭环时会偶发低压告警，需同步调整阈值与目标。
- `.env` 含数据库口令，**不得提交进 git**；示例文件中的口令均为占位符。
