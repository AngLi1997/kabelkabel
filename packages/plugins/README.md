# packages/plugins · 扩展插件

**后续扩展的业务插件统一放在这个目录下**（如文书著录、图片标记、OCR 识别…）。底座只含布局、工作台等公共能力，业务功能都以插件形式接入；插件之间只通过服务令牌、扩展点和命令 id 协作，不直接 import 彼此实现。

> 框选 `@kabel/plugin-region-select`（`region-select/`）是能力插件的参考写法：它只依赖工作台，通过舞台工具租约占用指针，用扩展点开放形状，用事件与服务把结果交给下游。

> 文件加载 `@kabel/plugin-file-loader`（`file-loader/`）：MinIO 桶+路径、本地目录、URL 列表三种来源，统一归一化后经 `WORKSPACE_SERVICE.setImages` 显示到舞台。

> 内置的工作台 `@kabel/plugin-workspace`（`workspace/`）也在此目录，可作为写法参考；它是 `builtin` 插件，由 `@kabel/editor` 的 baseline 预设默认注册。**所有业务插件都应只依赖它**：`dependencies: ['kabel:workspace']`，通过 `WORKSPACE_SERVICE` 与 `WorkspaceExtensions` 与内容协作，不 import 其他业务插件。

## 目录与命名

每个插件一个目录，目录名为插件短名，npm 包名为 `@kabel/plugin-<name>`：

```
packages/plugins/<name>/
├── package.json      name: @kabel/plugin-<name>
├── README.md         功能、集成方式、配置、命令、服务、事件、样式（必填）
├── tsconfig.json     { "extends": "../../../tsconfig.base.json", "include": ["src"] }
├── tsup.config.ts    与 `workspace/` 相同
├── src/
│   ├── index.ts      唯一对外入口
│   ├── plugin.ts     definePlugin 工厂函数
│   └── style.css     可选：类名自有前缀，使用 --kb-* 令牌
└── test/             单测，被根 vitest 自动包含
```

`package.json` 模板（`build` 中的脚本路径比顶层包多一级 `../`）：

```json
{
  "name": "@kabel/plugin-<name>",
  "version": "0.1.0",
  "description": "…",
  "type": "module",
  "license": "MIT",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./style.css": "./dist/style.css"
  },
  "files": ["dist"],
  "sideEffects": ["**/*.css"],
  "scripts": {
    "build": "tsup && node ../../../scripts/build-css.mjs dist/style.css src/style.css"
  },
  "dependencies": { "@kabel/core": "workspace:*", "@kabel/ui": "workspace:*", "preact": "^10.29.0" }
}
```

没有样式的插件把 `build` 简化为 `tsup`，并去掉 `./style.css` 导出。依赖其他插件时同样以 `workspace:*` 声明，并在 `definePlugin` 的 `dependencies` 中写上插件名。

## 接入清单

- 已被工作区自动识别（`pnpm-workspace.yaml` 包含 `packages/plugins/*`），新增后执行 `pnpm install` 即可。
- 测试：放在 `<name>/test/**/*.test.ts(x)`，用 `@kabel/core/testing` 的 `setupPlugins()`；`@kabel/plugin-<name>` 在 vitest 与 `pnpm typecheck` 中已自动映射到源码，无需先构建。
- 样式：若插件带 CSS，需把 `packages/plugins/<name>/src/style.css` 追加到 `packages/editor/package.json` 的 build 脚本中，主包的 `style.css` 才会包含它。
- 集成：宿主 `createArchiveEditor(el, { plugins: [myPlugin()] })` 或 `editor.use(...)`；要成为默认能力时再考虑放进 `createBaselinePreset`（业务功能通常不进 baseline）。
- 文档：改动插件对外行为时同步更新其 README 与 `docs/`。

详见 [插件开发指南](../../docs/plugin-guide.md)。
