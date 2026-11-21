# FOCUS — 現状アーキテクチャ調査

調査日: 2026-11-21  
対象ブランチ: `main`  
本番URL: https://b6tcvz8dnw-cpu.github.io/Focus/

## 現状

- HTMLエントリーポイント: `index.html`
- JavaScriptエントリーポイント: `src/main.js`（ES module）
- HTML/CSS: HTMLは `index.html`、CSSは引き続きインライン
- JavaScript: `src/main.js` と `src/core/`・`src/data/` のモジュールに分割開始
- `index.html`: 約91 KB / 約1,330行（JavaScript本体を外部化）
- インラインJavaScript: 約254行、約40個の関数
- CSS: 1つのインライン `<style>`
- PWAマニフェスト: `manifest.webmanifest`
- Service Worker: `sw.js`
- アイコン: `icon.svg`、PNGアイコン
- データ保存: ブラウザの `localStorage`（`src/data/storage.js` の防御的アダプター経由）
- 外部ライブラリ: なし（Node.js標準テストのみ）
- モジュール: `src/core/date-time.js`（`formatClock`, `dateKey`, `buildWeekData`, `getStudySkyLevel`）
- タイマー計算: `src/core/timer.js`（絶対時刻からの残り時間、休憩モードの選択）
- 保存層: `src/data/storage.js`（文字列・JSONの読み書き、利用不可・不正JSONへの防御処理）
- 学習記録集計: `src/data/records.js`（累計・日別履歴の再計算）
- アプリ本体の保存API直接呼び出し: 0件

## 画面

- Timer: `timerPage`
- Overview: `overviewPage`
- Calendar: `calendarPage`
- Analytics: `analyticsPage`
- Study Room: `studyRoomPage`
- Settings: `settingsPage`

## JavaScriptの主要責務

| 領域 | 現在の関数例 |
|---|---|
| タイマー | `startTimer`, `stop`, `tick`, `complete`, `restoreTimerRuntime`。純粋計算は `src/core/timer.js` |
| 学習統計 | `save`, `recalculateStats`, `getWeekData`。集計本体は `src/data/records.js` |
| カレンダー・履歴 | `renderCalendar`, `renderHistory`, `renderAllRecords` |
| 分析 | `renderAnalytics`, `updateChart` |
| 書斎 | `updateStudyRoom`, `updateStudySky`, `loadStudyRoomWeather` |
| 砂時計 | `startHourglass`, `tickHourglass`, `resetHourglass` |
| 外観・設定 | `setTheme`, `setMark`, `setStudyRoomMode` |
| 環境音 | `startAmbient`, `setAmbientLayer`, `stopAmbient` |
| バックアップ | `exportData` / `importData` のイベント処理 |

## 既存localStorageキー

- `focus-stats`
- `focus-notifications`
- `focus-timer-runtime`
- `focus-timer-settings`
- `focus-room-quiet-text`
- `focus-appearance`
- `focus-mark`
- `focus-preimport-backup`（インポート直前の自動退避）
- `focus-pre-migration-backup`（旧スキーマ移行前の退避）
- `focus-corrupt-stats-backup`（破損したJSONの原文退避）

これらは移行時に削除・改名しない。新しい保存層を導入する場合も、旧キーからの読み込みと移行テストを用意する。

## 主なリスク

1. タイマー、統計、履歴、表示が同じスクリプト内で相互参照している。
2. 保存層はアダプターへ集約済み。スキーマ移行・バックアップ検証は `src/data/schema.js` に集約する。
3. 画面要素IDを使ったDOM操作が広範囲にある。
4. Service Workerのキャッシュ更新とGitHub Pagesの公開を同時に変更すると、古い資産が残る可能性がある。
5. 書斎の描画・天候取得・砂時計は既存挙動を保ったまま切り離す必要がある。

## 推奨分割順

1. ~~純粋関数（日付・時間フォーマットなど）~~ 完了
   - `src/core/date-time.js` に抽出し、境界値テストを追加
2. 保存層とデータ形式
3. タイマー状態管理
4. 学習記録・統計
5. 書斎・砂時計
6. 画面表示とイベント登録
7. CSSの責務別分割

最初からすべてを分割しない。各段階でテストと実機確認を行う。
