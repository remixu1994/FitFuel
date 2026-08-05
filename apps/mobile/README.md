# FitFuel Android

FitFuel 的 Flutter Android 客户端，最低支持 Android 8.0（API 26）。客户端只访问 FitFuel HTTP API，不包含数据库地址、MiMo 密钥或 COROS 凭据。

## 开发运行

Windows 上先启用 Developer Mode（Flutter 插件需要创建 symlink），然后执行：

```powershell
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

真机调试时将 `API_BASE_URL` 替换为电脑局域网地址；生产环境使用 HTTPS API 地址。

## 目录

- `lib/app`：主题、路由和应用入口
- `lib/core`：Dio、Bearer 会话、安全存储和基础组件
- `lib/shared`：跨平台 DTO、格式化和校验逻辑
- `lib/features`：今日饮食、记录、统计、运动、Elavatine 和设置
- `android`：Android 8.0+ 工程配置，包名 `com.fitfuel.app`

首版保持在线模式，不使用 SQLite；Access Token 只保存在内存，Refresh Token 使用安全存储。
