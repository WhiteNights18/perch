# 栖格 Perch

GNOME Shell 51 原生桌面组件。以 Gridgets 的网格组织方式为参考，独立实现自己的代码、UUID 和数据存储。

## 产品约定

- 日常模式：组件位于普通窗口下方；只能操作内容，不会误拖动。
- 编辑模式：顶栏开启；显示网格、标题拖拽区和缩放手柄；方向键移动，Shift + 方向键缩放。
- 当前每类一个组件：日期时钟、便签、CPU/内存监控、月历、番茄钟、音乐、天气、照片。可隐藏和重新添加，保留内容。
- 统一圆角卡片、中文标签、明暗主题，设置窗口控制整体外观。
- 主屏可用区域内网格吸附、避免重叠；屏幕缩小时暂时隐藏放不下的组件，不破坏保存的布局。
- 隔离测试先行；语法、运行、视觉、真实用户会话分别记录。

## 里程碑

1. `v0.1.0-alpha.1`：仓库、GNOME 51 骨架、三个组件、网格编辑、持久化、设置及打包。
2. `v0.1.0`：真实用户会话验收、无障碍与桌面图标共存验证、安装升级说明。
3. `v0.2.0-alpha.1`：已完成月历、番茄钟、MPRIS 音乐和天气，含明暗外观与不可用状态。
4. `v0.2.0-alpha.2`：本地图片/文件夹轮播、统一尺寸规格、适配布局与设置页。
5. 后续：每屏独立布局、多实例、组件选择器预览及布局导入导出，继续补齐真实用户会话验收。

首版不实现任意脚本执行、在线组件市场和背景模糊。

## 架构

`extension.js` 组织生命周期和顶栏入口；`lib/desktop.js` 管理桌面和编辑状态；
`lib/layout.js` 为无 GNOME 依赖的布局算法；`lib/card.js` 为卡片与手势；
`widgets/` 为组件；`lib/store.js` 管理带版本的原子文件写入；
`lib/system.js` 异步读取真实系统指标；`prefs.js` 用 GTK4/libadwaita 管理偏好。

偏好使用 GSettings；布局和便签使用 `$XDG_DATA_HOME/perch/state.json`（默认 `~/.local/share/perch/state.json`）。
禁用时同步销毁界面与信号，取消采样；文件保存使用无界面引用的异步队列完成最后一次写入。

## Git

`main` 保留已完成的里程碑；`feat/*` 与 `fix/*` 开发；小步提交；发布使用版本标签。
提交源码、测试、文档，排除编译 schema、安装包、个人数据。不自动创建远程仓库或上传。

## 参考

- https://github.com/rebatnaath/gridgets — 行为与桌面层级参考，GPL-3.0。
- https://gjs.guide/extensions/upgrading/gnome-shell-51.html — GNOME 51 API 迁移。
- https://gjs.guide/extensions/review-guidelines/review-guidelines.html — 生命周期与发布检查。

本项目采用 GPL-3.0-only。未复制 Gridgets 的组件实现或资源。


### 0.3.0-alpha.1

紧凑缩放、连续拖动、备忘录焦点编辑、数字时间、Amberol 启动与本地封面/歌词、任务、应用启动器和照片多实例。其他组件多实例、远程歌词服务及多屏独立布局仍在后续范围。
