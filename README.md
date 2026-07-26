# Danmaku Reminder 🚀

> 全屏弹幕提醒工具 — 到点了，躲不开。

一个 Windows 桌面工具，到时间在全屏铺满弹幕提醒你。支持 3D 球体旋转爆炸特效、鼠标穿透、常驻系统托盘，让你**绝对不可能忽略**任何提醒。

![fullscreen_attack](https://github.com/wusuowei235/danmaku_reminder/assets/screenshot_attack.png)

## ✨ 功能

### 三种弹幕模式

| 模式 | 效果 | 适合 |
|------|------|------|
| **Scroll** 滚动 | 彩色文字从右向左飘过屏幕 | 轻度提醒，不打扰 |
| **Center Pop** 居中弹入 | 大字缩放 + 发光脉冲动画 | 中度提醒 |
| **Fullscreen Attack** 💥 | 80-100 条弹幕聚成 3D 球体 → 旋转 → 爆炸扩散 | **默认模式，极重度提醒** |

### 智能提醒

- **⏰ 定时触发** — 自定义间隔（分钟），到点自动弹
- **🔁 重复连发** — 一次提醒可连发 N 次，间隔 0.6 秒
- **😴 Snooze 推迟** — 弹窗 8 秒，点击后推迟 n 分钟再次提醒
- **📋 窗口黑名单** — 检测前台进程名/窗口标题，全屏游戏/视频自动静音
- **📅 生效时段** — 按工作日/时间段设置生效规则

### 实时调节

所有设置通过滑块实时调节，即时生效，无需重启：

透明度 · 速度 · 字号 · 弹幕数量 · 球体半径 · 字体颜色（11 种渐变色预设 + 单色自定义）

### 系统集成

- 🖥️ 全屏透明覆盖层，鼠标穿透（不干扰操作）
- 🎯 常驻系统托盘，开机自启
- 🔇 独立音效系统

![settings](https://github.com/wusuowei235/danmaku_reminder/assets/screenshot_settings.png)

## 🚀 快速开始

### 方式一：Python 运行

```bash
# 1. 克隆仓库
git clone https://github.com/wusuowei235/danmaku_reminder.git
cd danmaku_reminder

# 2. 安装依赖
pip install -r requirements.txt

# 3. 启动
python main.py
```

或者直接双击 `start.bat`（自动检测依赖并安装）。

### 方式二：打包 EXE

```bash
# 运行构建脚本
build.bat
```

输出在 `dist/DanmakuReminder.exe`，单文件可执行，无需 Python 环境。

## ⚙️ 使用指南

### 首次启动

1. 双击 `start.bat` 或运行 `python main.py`
2. 程序启动后常驻系统托盘（任务栏右下角）
3. 默认已创建一条示例提醒（间隔 60 分钟）
4. 右键托盘图标 → **打开设置** 可管理所有配置

### 创建提醒

在设置页面点击「添加提醒」：

- **名称** — 仅用于列表标识
- **弹幕文案** — 要显示的文字内容
- **间隔时间** — 多久触发一次（分钟）
- **弹幕样式** — scroll / center_pop / fullscreen_attack
- **重复次数** — 每次触发后额外连发次数
- **推迟分钟** — Snooze 默认推迟时长
- **生效时段** — 按星期几 + 时间段设置

### 弹幕颜色

- **渐变模式** — 11 种预设渐变色，每次弹幕随机取色
- **单色模式** — 9 种纯色预设 + 自定义取色器（HEX 格式）

### 窗口黑名单

添加进程名（如 `notepad.exe`）或窗口标题匹配规则，匹配时自动跳过提醒触发。

### 右键托盘菜单

| 菜单项 | 作用 |
|--------|------|
| 打开设置 | 显示设置窗口 |
| 暂停/恢复 | 暂停或恢复所有提醒 |
| 推迟 | 推迟当前显示的提醒 |
| 退出 | 退出程序 |

## 🏗️ 架构

```
main.py
├── app/
│   ├── api.py            # JS Bridge — Python ↔ JavaScript 双向通信
│   ├── db.py             # SQLite 数据库层（reminders / settings / blacklist）
│   ├── scheduler.py      # 定时引擎（threading.Timer）
│   ├── tray.py           # 系统托盘图标
│   └── window_manager.py # 前台窗口检测（黑名单匹配）
├── web/
│   ├── danmaku/          # 弹幕渲染覆盖层（HTML + CSS + JS）
│   │   ├── index.html
│   │   ├── script.js     # 弹幕动画引擎 + 3D 球体
│   │   └── style.css
│   └── settings/         # 设置页面
│       ├── index.html
│       ├── script.js
│       └── style.css
├── main.py               # 主入口
├── start.bat             # 快捷启动脚本
├── build.bat             # PyInstaller 打包脚本
└── requirements.txt
```

双窗口架构：**Overlay（全屏透明弹幕窗口）** + **Settings（frameless 设置窗口）**，通过 `pywebview` 的 JS Bridge 通信。

## 🛠️ 技术栈

| 组件 | 方案 |
|------|------|
| **桌面框架** | [pywebview](https://github.com/r0x0r/pywebview) 4.x（WebView2 内核） |
| **前端动画** | Web Animations API + CSS Animations |
| **3D 球体** | Fibonacci Sphere 算法 + 自研投影引擎 |
| **数据存储** | SQLite（Python 内置） |
| **系统集成** | Win32 API（窗口样式、点击穿透、前台检测） |
| **系统托盘** | pystray |
| **进程检测** | psutil + pygetwindow |

外部依赖仅 **1 个**核心运行时（pywebview），其余为标准库或辅助工具。

## 📦 依赖

```
pywebview>=4.0   # 桌面窗口 + WebView2 渲染
pystray>=0.19    # 系统托盘图标
Pillow>=10.0     # 托盘图标生成
psutil>=5.9      # 进程检测
pygetwindow>=0.0 # 窗口标题检测
pywin32>=305     # Win32 API 绑定
```

## 📄 License

MIT

---

*你可能不需要一个全屏攻击的提醒工具，但如果你需要一个「躲不开」的提醒——它就在这儿。*
