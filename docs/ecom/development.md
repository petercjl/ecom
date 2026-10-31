# Ecom 开发工作区

## 目录与版本

项目根目录是唯一源码维护入口，Git origin 指向 petercjl/ecom。main 从 Ecom 初始提交开始演进，源码来源记录保留固定版本及许可证。

.brave-build/src/brave 是同一 Git 仓库的 detached 构建工作树，供工具链使用 src/brave 布局；.brave-build/src 下其余内容属于固定 Chromium 依赖。构建目录和本地缓存排除提交。

## 开发工具命令

通过 package.json 中 ecom:prepare 准备指定 Ecom 提交的工作树，ecom:status 查询状态，ecom:bootstrap 安装锁定依赖。build 和 start 在该构建工作树执行原生脚本。源码修改提交后再准备工作树；已有工作树存在本地修改时停止切换，并保留修改。

开发工具不拉取 Brave 仓库或维护上游分支。依赖引导仅获取 package.json、DEPS 与基线元数据固定的 Chromium、depot_tools 和第三方代码。开发与产品版本调整分别经过验证。

## 中断恢复

已下载依赖随构建工作树保留。depot_tools 的首次 bootstrap 若中断，先在现有下载上完成 ensure_bootstrap，再归档 guard；不删除整个缓存重来。锁定版本不一致、目标路径被其他仓库占用或本地修改存在时明确报错。

完整源码与工具链下载需要持续检查磁盘；本机前一初始化任务已停止以便切换为 Ecom 工作树。后续原生编译需完成完整 Xcode/SDK 准备。构建和安装的支持范围以真实运行证据为准。

开发启动默认使用 .brave-build/profiles/Ecom-Dev 保存独立数据。显式开发数据目录参数按调用方选择执行；Ecom 开发入口保持自身更新渠道。
