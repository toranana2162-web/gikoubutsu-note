# CLAUDE.md

技工物管理アプリの開発ガイド（詳しい要件は `requirements.md`）。

## 概要
歯科医院向け「技工物管理ノート」。依頼〜納品状況をデジタル管理する。

## アーキテクチャ
ビルド不要の静的SPA。3ファイルのみ。フレームワーク・依存パッケージなし。
- `index.html` — 画面構造。3ビュー（`#view-top` / `#view-list` / `#view-form`）をタブで切替。
- `styles.css` — 紙ノート風スタイル。CSS変数（`:root`）で配色管理。640px でPCレイアウトへ。
- `app.js`   — IIFE。`localStorage`（キー `gikoubutsu.records.v1`）にレコード配列を保存。

## データモデル（1レコード）
`id, impressionDate, patientName, content, teeth[], sendItems[], dueDate, delivered, deliveredDate, instructionChecked, createdAt`
- `teeth[]` … 歯式コード配列。象限 UR/UL/LR/LL ×（永久歯 1〜8 / 乳歯 A〜E）。例 `"UR6"`=右上6番、`"URA"`=右上A（乳歯）。永久歯／乳歯はチャート上部のボタンで切替（選択は両歯列とも保持＝混合歯列可）。`formatTeeth()` で「右上6・7」「右上C」等に変換（永久歯→乳歯の順で並ぶ）。
- 技工所は1か所のため `lab` は廃止（F-07 技工所検索も削除済み）。

## 状態判定
`statusOf(r)` が `delivered | overdue | today | pending` を返す。日付比較は `YYYY-MM-DD` 文字列の辞書順（ローカル時刻基準）。

## 制約・方針
- 無料枠で完結／ログイン認証なし／ブラウザ利用。
- 保守性重視：項目追加は index.html のフォーム＋app.js の `collectSendItems`/`cardHtml` を対応させる。
- ユーザー入力は `escapeHtml` を通して描画（XSS対策）。

## テスト
jsdom による E2Eフロー検証スクリプトあり。DOMイベントを発火して登録〜検索〜編集〜削除を確認する。

## Phase2 候補（未実装）
CSV出力（F-12）、クラウド保存での端末間共有。
