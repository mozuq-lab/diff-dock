# DiffDock

DiffDockは、ローカルブラウザでそのまま開ける簡易差分比較ツールです。行単位の差分に加えて、変更行では文字単位の差分も表示します。後でElectronへ移行しやすいように、HTML、スタイル、差分ロジック、UI制御を分けています。

## ファイル構成

- `index.html`: 画面構造
- `styles.css`: 見た目
- `diff-engine.js`: 行単位と文字単位の差分ロジック
- `app.js`: 入力、ボタン、表示更新などのUI制御
- `main.js`: Electronのメインプロセス
- `preload.js`: Electronのpreloadスクリプト
- `package.json`: Electron起動用のnpm設定

## 開き方

Finderでこのフォルダを開き、`index.html`をブラウザにドラッグするか、ダブルクリックしてください。

ターミナルから開く場合:

```sh
open index.html
```

ビルドやパッケージインストールは不要です。

## Electronで起動する場合

初回だけ依存関係をインストールしてください。

```sh
npm install
```

起動:

```sh
npm start
```

`npm start`はローカル開発用にElectronウィンドウで`index.html`を開きます。

## macOSの`.app`バンドルを作成する場合

初回だけ依存関係をインストールしてください。

```sh
npm install
```

作成:

```sh
npm run build:mac
```

成功すると`out/mac/DiffDock.app`が作成されます。ローカル実行用のad-hoc署名を行いますが、配布用のDeveloper ID署名やnotarizationは含みません。

## 大きな入力について

大きな入力ではブラウザの負荷を避けるため、共通の先頭・末尾を除いたうえで比較します。それでも比較範囲が大きすぎる場合は、画面に「大きすぎるため簡易比較に切り替えました」と表示し、軽量な比較に切り替えます。
