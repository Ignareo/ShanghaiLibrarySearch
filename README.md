# Shanghai Library MCP


还在手动打开网页、输入关键词、翻页找书、点进详情页看馆藏吗？

现在，这些动作都可以交给 AI 一口气完成啦！(๑•̀ㅂ•́)و✧

你可以直接问AI：

- “帮我找 5 本上海图书馆里关于城市研究的可借书”
- “查一下鲁迅相关馆藏，优先筛掉不可借的”
- “围绕‘社会学入门’推荐一批适合新手的书”
- “批量搜这些关键词，并按可借状态汇总”

注意：
- 仅使用于上海图书馆
- 不涉及任何账号登录、个人隐私、敏感信息等
- 仅提供公共目录检索功能，不涉及预约、续借等操作

---

面向上海图书馆公共目录的 TypeScript 原生 MCP Server。它将公开站点中的图书检索、馆藏查询、筛选与主题匹配能力，整理为可被 Claude Code、VS Code、Cherry Studio 等 MCP Host 直接调用的结构化工具集。

## 项目定位

本项目不是新的图书馆前端，也不是私有数据库接口，而是一个基于公开网页抓取与解析的本地工具型服务：

- **运行时**：Node.js + TypeScript
- **协议**：MCP
- **默认传输方式**：`stdio`
- **分发方式**：`npm` / `npx`
- **数据来源**：上海图书馆公开目录页面

适合的使用场景包括：

- 在 AI 客户端中按关键词搜索书目
- 通过高级检索组合题名、作者、主题、馆藏馆、行政区、出版年等条件
- 查询单条记录的馆藏明细与可借状态
- 对多个主题批量搜索并附加馆藏过滤
- 围绕一个主题自动寻找可用书目

## 核心能力

### 1. 关键词检索

输入关键词后，返回结构化搜索结果，包括书名、作者、出版社、出版年、索书号、文献类型、分页信息等。

### 2. 高级检索

支持题名、作者、主题、索书号、ISBN、ISSN、出版社、出版地、出版年范围，以及行政区、馆藏馆、分类、语言、文献类型等筛选条件。

### 3. 馆藏查询

根据 `record_id` 查询馆藏明细，返回馆藏地、馆藏馆、索书号、借阅类型、原始状态和归一化后的可借状态。

### 4. 批量搜索

一次提交多个查询词，按组返回搜索结果，并可选择附加馆藏与可借过滤。

### 5. 主题匹配

围绕一个主题自动翻页扫描候选记录，并按馆藏过滤条件找出更适合的书目。

## 环境要求

- Node.js `20.18.1+`
- npm / npx

## 安装与运行

推荐零安装直接运行：

```bash
npx -y shanghai-library-mcp
```

如果你会频繁在命令行中使用，也可以全局安装：

```bash
npm install -g shanghai-library-mcp
shanghai-library-mcp
```

如果你希望把它安装到某个项目里，再从该项目中调用，可以在项目目录内执行：

```bash
npm install shanghai-library-mcp
npx shanghai-library-mcp
```

注意：`npm install shanghai-library-mcp` 默认是**本地安装**，会写入当前目录的 `node_modules`。因此请在项目目录中执行，不要在 `C:\Windows\System32` 这类系统目录中直接运行。


## 主流 MCP Host 接入

### Claude Code

Windows 原生环境推荐：

```powershell
claude mcp add --transport stdio --scope project shanghai-library-search -- cmd /c npx -y shanghai-library-mcp
```

macOS / Linux / WSL 可直接使用：

```bash
claude mcp add --transport stdio --scope project shanghai-library-search -- npx -y shanghai-library-mcp
```

### VS Code

在项目中配置 `.vscode/mcp.json`：

```json
{
  "servers": {
    "shanghaiLibrarySearch": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "shanghai-library-mcp"]
    }
  }
}
```

### Cherry Studio

可导入如下配置：

```json
{
  "mcpServers": {
    "shanghai-library-search": {
      "name": "Shanghai Library Search",
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "shanghai-library-mcp"],
      "env": {}
    }
  }
}
```


## 架构概览

项目采用“抓取 → 解析 → 编排 → MCP 暴露”的分层设计：

- `src/index.ts`：CLI 入口，启动 MCP Server
- `src/mcp-server.ts`：注册 MCP tools / resources，做输入输出边界校验
- `src/service.ts`：编排搜索、高级搜索、馆藏、批量查询和主题匹配流程
- `src/client.ts`：负责请求上海图书馆站点页面
- `src/parsers.ts`：解析搜索结果页与馆藏页 HTML
- `src/advanced-search.ts`：解析高级检索动态选项，并构造实际请求参数
- `src/models.ts`：集中定义 Zod Schema 与共享数据契约

设计重点：

1. **对外暴露稳定的 MCP 接口**，对内适配页面型站点变化
2. **高级检索选项动态发现**，避免把馆藏馆、行政区、分类等枚举硬编码到代码里
3. **馆藏状态归一化**，把中英混合、格式不一致的状态整理成可稳定过滤的字段
4. **结构化输出**，降低 Host 二次解析自由文本的成本

## MCP 接口

### Tools

| Tool                          | 说明                     | 主要输入                                           |
| ----------------------------- | ------------------------ | -------------------------------------------------- |
| `search_books`                | 关键词搜索图书           | `query`, `page`                                    |
| `get_advanced_search_options` | 获取高级检索可用选项     | `refresh`                                          |
| `search_books_advanced`       | 执行结构化高级检索       | 题名、作者、主题、年份、分类、语言、馆藏过滤等     |
| `get_record_holdings`         | 查询单条记录馆藏         | `record_id`                                        |
| `batch_search_records`        | 批量执行多个查询         | `queries`, `include_holdings`, `available_only` 等 |
| `find_matching_books`         | 围绕主题自动寻找候选图书 | `topic`, `target_count`, `availability_filters` 等 |

### Resources

| Resource                                    | 说明                                   |
| ------------------------------------------- | -------------------------------------- |
| `library://availability-categories`         | 归一化可借状态分类说明                 |
| `library://server-info`                     | 服务版本、运行时、transport、tool 集合 |
| `library://advanced-search-options-summary` | 高级检索选项摘要                       |



## 本地开发

安装依赖并运行校验：

```bash
npm install
npm run build
npm run test
npm run format:check
```

开发态启动：

```bash
npx tsx src/index.ts
```

构建后启动：

```bash
node dist/index.js
```

## 返回结果特点

本项目返回的不是网页片段，而是适合 AI / Agent 直接消费的结构化数据：

- 搜索结果保留核心书目信息与分页信息
- 馆藏结果同时保留原始状态与归一化后的 `availability`
- 高级检索返回结构化筛选选项与解析后的真实参数
- 批量与主题匹配能力返回统计、告警、错误与命中结果

## 项目结构

```text
src/     TypeScript 源码（MCP server、service、client、parser、schema）
tests/   集成测试
```

## License

MIT
