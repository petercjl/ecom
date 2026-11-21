# windows-x64 Lumyne 0.1.10

原生源码：`02c3aa59205ca8e015c57a0f6d06f57659f9be7a`；包身份：`@lumyne/ecom-windows-x64@0.1.10`。关联 [Mac Dev 验证](dev-lumyne-0.1.10.md)。Mac、Windows 的源码差异仅为发布测试补充，原生更新器源文件一致。

实际更新器自检、完整载荷校验和损坏分块拒绝通过。保存的实际 0.1.9 过渡更新器完整校验此新源载荷；实际 0.1.8 更新器拒绝直接使用新源载荷，且此前已接受最终 0.1.9 过渡包。 本机 npm-release-kit 固定制品与原生打包 tarball 字节一致。SHA-256：`c752ceac3b85d14f4107f9d246e91e1e5a35c865ac730d5ef1960501e8ccfcfc`；SHA-512 SRI：`sha512-n4Fn53ACFYl+ansrDJe5+y9BSOircwT+fl+ZszUrOhirWlKSJcp9RT0xS+N7L/hLYA79E/G7UzLcvpnotP7plQ==`。完整哈希与分块身份见发行记录。

本次迁移验收为原生构建、自动包检查和离线更新器契约；未执行日常正式应用的实际安装、npm GUI 更新往返或回滚。账号 Profile 及已安装的正式应用保持原状。当前制品通过校验，公共 npm 发布和下载验证在发布后补充。
