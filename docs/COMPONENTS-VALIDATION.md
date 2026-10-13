# 四类新组件验证记录

日期：2026-10-13。版本：0.2.0-alpha.1。GNOME Shell 51.0、GJS 1.90.0。

## 验证范围

- 静态语法、严格 schema、6 项布局测试、3 项系统指标测试、4 项新增模型测试，以及 GJS 真实文件持久化测试通过。
- 新增模型覆盖：旧版布局和中文便签迁移、闰年二月/跨年、暂停/续计/休眠后过期、缺失天气字段拒绝伪装为 0°。
- 在隔离真实 GNOME 51 会话中验证全部七张卡片，明暗截图检查通过。保留原有拖拽、缩放、便签键盘输入、连续启停和重置布局回归。
- 实际键盘操作月历的“下个月”和“回到今天”，确认月份变化与恢复。
- 实际键盘启动、暂停、续计番茄钟；切换主题及禁用后重新启用不清除运行中的截止时间；到期显示完成并发出通知，手动进入休息阶段。
- 使用测试专用 MPRIS 服务经真实 D-Bus 验证曲目信息、播放/暂停、上下曲、CanControl 不允许时禁用按钮，以及播放器退出后清空状态。测试服务不打包、不注入用户会话。此结果不等同于已验证所有第三方播放器。
- Open-Meteo 实际城市查询确认江苏苏州为 31.30408, 120.59538；GJS 客户端的真实天气请求成功，Shell 天气卡片也显示了数据和时间戳。接口数据是天气模型结果，未伪造为传感器观测。
- 对月历标题、音乐标题、番茄钟标题实际 Pango 字体运行增加断言，保持 `Noto Sans CJK SC`；设置窗口可打开。新增设置项的城市选择业务通过服务查询验证，GTK 城市搜索按钮未进行自动化点击验收。

最终隔离驱动结果：`PASS`。修正了浅色主题中渐变页眉遮住便签标题的问题，页眉改为稳定的纯黄色背景。

## 已知边界

- 月历没有日程账户同步；音乐使用通用装饰图标，不加载远程专辑图像。
- 番茄钟隐藏或扩展禁用时不发通知，重新显示时依据保存的截止时间检查到期；系统时间调整可能影响它。
- 天气自动刷新间隔为 15 分钟，仅在显示时联网。缓存只在当前 Shell 进程保留；失败时有缓存则标记旧数据，无缓存显示不可用。没有进行人为断网的完整桌面交互测试。
- 日常 GNOME 会话、真实中文输入法、混合缩放、多屏热插拔、长时间运行和第三方播放器组合仍需用户环境验收。
- [明亮外观](screenshots/all-widgets-light.png)、[深色外观](screenshots/all-widgets-dark.png) 中音乐为真实无播放器状态，便签为测试文字。单独的 [模拟音乐控制截图](screenshots/music-fixture.png) 使用明确标注的测试曲目。

## 复现

`bash scripts/check.sh`；`bash scripts/test-shell.sh /tmp/perch-components-unique`；联网可选 `gjs -m tests/weather-live.gjs.js`。

天气 API：[Forecast](https://open-meteo.com/en/docs)、[Geocoding](https://open-meteo.com/en/docs/geocoding-api)。音乐：[MPRIS Player 规范](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html)。

## 本机安装

2026-10-13 已备份旧版并更新 `~/.local/share/gnome-shell/extensions/perch@perilla.local`。23 个发布文件与安装包逐字节一致，schema 严格编译通过。没有更改个人布局、便签或其他扩展设置。

当前正在运行的 GNOME 会话仍未发现此 UUID，查询返回 extension does not exist，不能宣称 ACTIVE。保存工作后注销、重新登录，再执行 `gnome-extensions enable perch@perilla.local`。如果沿用旧布局而希望采用截图排列，可在设置中重置布局；这不会删除便签或番茄钟状态。
