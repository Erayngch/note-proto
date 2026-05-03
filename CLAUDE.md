# グラフ型メモ帳アプリ

グラフによって知識を管理するメモ帳アプリのリポジトリ。

## パッケージ構成

このアプリではメモの管理を行うAPIをAdapterとそれを利用するためのUIを分離している。

- `packages/*`
  - `packages/core`: Adapterの共通インターフェース定義
  - `packages/adapter-idb`: ブラウザのIndexDBを利用するAdapter。ブラウザ単体で動作する
  - `packages/adapter-sqlite`: ローカルのSQLiteファイルを利用するAdapter。Node.js用
- `apps/*`
  - `apps/pages`: Cloudflare Workersにデプロイできるブラウザ完結のアプリ
  - `apps/web`, `apps/server`: Node.jsで動作するAPIサーバー&SPA

## コマンド

プロジェクトのルート

```bash
# run lint, fmt and type check for all packages
vp run check
```

それ以外のパッケージ個別のコマンドはパッケージごとの`README.md`を参照
