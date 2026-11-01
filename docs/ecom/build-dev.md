# 本地编译并重启 Ecom Dev

在项目根目录完成源码提交后运行：

```sh
node ecom/build-dev.mjs
```

也可使用 `pnpm run dev:restart`。脚本选择满足项目要求的本机 Node 24 与完整 Xcode，调用现有工作区入口增量编译 Component 开发版。显式配置的 DEVELOPER_DIR 优先；系统工具选择保持原状。

编译成功且源码版本保持一致后，脚本根据可执行文件、当前用户和工作区 Dev Profile 校验实例，正常退出浏览器，再使用原 Profile 及会话恢复参数启动。实例未运行时直接启动。编译失败时不执行浏览器退出或重启动作。

当前入口采用普通有界面模式。进程发现通过系统进程表完成，核对主程序真实路径、用户及数据目录；退出前再次核对实例，再发送 Chromium 原生支持的 SIGINT，由其正常 Exit 流程处理。若未正常退出，脚本停止，保留现场供人工处理。

启动和重启均不依赖 CDP。工作区启动入口拒绝 remote-debugging、headless、enable-automation 和自动打开 DevTools 的参数。重启时将旧 DevToolsActivePort 文件归档到本次私有日志目录；就绪检查确认新进程稳定、无相关启动参数、无 TCP 监听，且未生成新的调试端点文件。既有 Profile、容器及站点数据继续由浏览器管理。

当前 Profile 为 `.brave-build/profiles/Ecom-Dev`。启动日志位于每次单独创建的 `.brave-build/dev-restart-*/start.log`；日志目录和文件分别采用 0700、0600 权限。脚本使用任务锁避免重复执行，保留中断任务的旧锁记录。

Component 开发版依赖构建目录中的动态库。启动时使用构建目录里的主程序，并在需要时保留备份、校验字节后解除旧更新副本的可执行文件硬链接。此开发入口关闭仅服务于整包自动更新的 MacAppCodeSignClone 功能；正式产物的更新与签名流程单独验证。

本机 macOS arm64 是当前验证环境。Windows 的构建与重启实现及验收在后续平台工作中补充。
