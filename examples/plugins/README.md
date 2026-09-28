# 示例插件 `@kabel-examples/plugins`

演示第三方插件以独立 npm 包形式分发。包内每个插件一个目录，通过子路径导出：

| 插件 | 导入路径 | 说明 |
| --- | --- | --- |
| [档号生成](archive-code/README.md) | `@kabel-examples/plugins/archive-code` | 按规则生成档号写入著录字段 |

## 目录规范

```
examples/plugins/
├── package.json          子路径导出、peerDependencies
├── README.md
└── <plugin-name>/
    ├── README.md         功能、集成方式、配置、贡献项
    ├── src/
    │   ├── index.ts      唯一对外入口
    │   ├── plugin.ts     definePlugin 工厂函数
    │   └── …             纯逻辑与视图拆分到独立文件
    └── test/
        └── *.test.ts     由根 vitest 收集
```

约定：

- 依赖 Kabel 使用 **peerDependencies**（`@kabel/editor`），由宿主提供，避免重复安装内核与渲染层；仓库内开发通过 devDependencies 的 `workspace:*` 链接。
- 插件写成工厂函数 `(options) => definePlugin({...})`，`name` 使用自有前缀（示例为 `example:`），并设置 `title`（插件管理中的显示名称）。
- 依赖其他插件时声明 `dependencies`，并只通过服务令牌、命令 id、扩展点协作。
- 新增状态 / 事件时用 `declare module '@kabel/editor'` 补充类型。
- 本包直接导出 `.ts` 源码，供仓库内示例工程消费；真正发布时应像 `packages/plugin-*` 一样用 tsup 构建为 ESM + CJS + d.ts。

## 新增示例插件

1. 新建 `examples/plugins/<name>/{src,test}` 与 `README.md`。
2. 在 `package.json` 的 `exports` 中添加 `"./<name>": "./<name>/src/index.ts"`。
3. 在本文件的插件表中登记。

更多见 [插件开发指南](../../docs/plugin-guide.md)。
