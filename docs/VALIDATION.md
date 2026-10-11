# 首版验证记录

日期：2026-10-11。当前目标：`0.1.0-alpha.2`。

## alpha.2 字体和外观复测

- 卡片标题、便签正文和已经显示的顶栏菜单：读取 Clutter.Text 的 Pango 布局，逐个检查实际字形运行所用字体，全部为 `Noto Sans CJK SC`。记录见 [字体运行结果](font-runs.txt)。
- 设置窗口使用限定到 Perch 窗口的 GTK 字体样式，成功显示并检查截图。未对这个独立 GTK 进程内的字形运行做自动断言。
- 柔和卡片、浅色暖黄便签、深色便签、双环 CPU/内存均完成实际渲染检查。截图已更新为此版本。
- 9 项单元测试、GJS 持久化测试及完整隔离 Shell 交互回归通过，最终驱动结果 `PASS`。拖拽、缩放、键盘输入、布局恢复、连续启停和设置窗口保持可用。
- 字体问题处理在扩展及其设置窗口内；没有修改系统全局 Fontconfig 或 GNOME 字体配置。

下面为首版建立的验证项目，alpha.2 已按上述范围复测。

## 已验证

环境：本机 GNOME Shell 51.0、GJS 1.90.0、Node.js 26.11.1。
真实 Shell 测试运行在隔离的 Wayland headless 会话，虚拟显示器 1440×1000，软件渲染。
测试使用独立 XDG 目录、keyfile 设置后端和 D-Bus，不安装到日常桌面。

| 检查 | 结果 |
|---|---|
| 全部 JavaScript 语法检查、严格 GSettings schema 检查 | 通过 |
| 6 项布局/数据单元测试 | 通过，含 264 组屏幕网格尺寸的不越界、不重叠检查 |
| 3 项 CPU/内存计算单元测试 | 通过，异常数据不伪装为零使用率 |
| GJS 真实异步文件持久化 | 通过，最新写入胜出、禁用时提交、重载一致 |
| 数据权限及未知版本保护 | 通过，0600；未知版本原文件不变 |
| 三张卡片的真实 Shell 渲染 | 通过，含实际时钟和 `/proc` 系统数据 |
| 顶栏菜单打开 | 通过，截图留存 |
| 编辑模式切换与层级 | 通过，日常位于窗口层内，编辑提升至 UI 层 |
| 虚拟输入设备模拟鼠标拖动 | 通过，真实 PanGesture 将时钟移动一格 |
| 虚拟输入设备模拟右下角缩放 | 通过，真实 PanGesture 将宽度扩大一格 |
| 方向键移动及 Esc 退出 | 通过 |
| 便签真实键盘输入 | 通过，键盘输入更新存储状态 |
| 隐藏/恢复组件、切换主题 | 通过 |
| 连续三次禁用/启用 | 通过，便签和调整后的宽度均恢复，旧桌面 actor 已移除 |
| 关闭期间请求重置布局 | 通过，下次启用恢复初始位置，便签保留 |
| GTK4/libadwaita 设置窗口 | 成功打开并截图检查 |
| 扩展安装包结构 | 含 metadata、入口、样式、设置、schema、lib、widgets 和 LICENSE；不含测试驱动 |

本次最终 Shell 驱动结果为 `PASS`。开发时查出的 GNOME 51 `addChrome` 参数差异已修复。
虚拟鼠标初始位于热角边界，测试驱动在按下前重复定位，以避开首个移动受边界约束的问题。

## 尚未验证

- 用户当前桌面会话中的安装、中文输入法组合输入、锁屏/解锁、实际显示器热插拔和混合缩放。
- 与 Desktop Icons NG、Blur my Shell 等扩展共同启用后的交互。
- Shift + 方向键缩放已实现，但本轮没有单独的端到端输入断言。
- 长时间运行的资源占用、崩溃恢复，以及不同字体/主题下的可访问性。
- GNOME Extensions 网站发布审核；本仓库尚未创建远程仓库或提交商店。

因此版本标记为 alpha，不声明已通过用户日常桌面的完整验收。

## 环境噪声

隔离会话日志包含系统日历服务缺少 `libecal`、无 PipeWire/RealtimeKit、空壁纸 URI、无障碍注册服务启动失败等环境消息。
设置窗口仍能成功显示；最终日志没有 Perch JavaScript 异常或 St 样式警告。
这些环境消息不作为扩展通过或失败的替代证据。

## 截图

这些是实际隔离 GNOME Shell 的渲染截图。便签内容是明确编写的测试文字，系统指标来自测试时本机真实采样。

- [深色桌面](screenshots/desktop-dark.png)
- [浅色桌面](screenshots/desktop-light.png)
- [编辑模式](screenshots/edit-mode.png)
- [顶栏菜单](screenshots/panel-menu.png)
- [重启扩展后](screenshots/after-reenable.png)
- [设置窗口](screenshots/preferences.png)

## 重现

在仓库根目录执行 `bash scripts/check.sh`，再执行 `bash scripts/test-shell.sh /tmp/perch-test-unique`。
测试目录必须为空；其中会输出 `result.txt`、`shell.log` 和截图。
系统需要支持 GNOME 51 headless 会话和本地 D-Bus 套接字。
