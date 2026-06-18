# SpeakUp! Choicy（プロトタイプ）

ハワイ・ワイキキを舞台にした、**音声認識×英語スピーキング練習のミニゲーム**です。日本語話者の英語学習者（A1〜C2）を対象に、「使える英語フレーズ」と、英語のかたまり順で考える **“英語脳”** を身につけることを狙っています。

> **社内限定 / Confidential** — 本リポジトリは社内検証用の非公開プロトタイプです。外部への共有・公開はしないでください。デザイン・データ・音声・キャラクター（Choicy）を含みます。

---

## 1. これは何か

- 1画面のWebアプリ（ビルド不要のバニラ構成: HTML + CSS + JS）。
- プレイの流れ: **タイトル → エリア選択（マップ）→ シーン（対話練習）→ 結果（採点）**。
- 各シーンは2人の会話。プレイヤーは役（質問役/応答役）を選び、相手のセリフの後に自分の番のセリフを発話します。録音音声を採点し、単語ごとの色分け・発音のヒント・リズム評価を返します。
- 学習補助として、4段階ヒント（万次郎語→穴あき英語→全文）、お手本音声、発音図解（アニメ＋読み上げ）を備えています。

舞台は現状 **ワイキキ1エリア・7シーン**。ロサンゼルス／ニューヨークは「COMING SOON」のロック表示のみ（データ未投入）。

---

## 2. すぐ動かす

ブラウザのセキュリティ制約上、`file://` で直接開くと動きません。**ローカルHTTPサーバ経由**で開いてください。

```bash
# リポジトリ直下で
python -m http.server 8000
# → ブラウザで http://localhost:8000
```

初期状態は `DEMO_MODE: true`（`config.js`）なので、**APIキーもマイクも不要**で全画面・全機能のUIを確認できます（採点はダミー値）。実際のマイク録音と本番採点を試す場合は後述の設定が必要です。

動作確認ブラウザ: 最新の Chrome / Safari（iOS Safari 含む）。マイク録音・音声合成・Web Audio を使うため、HTTPS もしくは `localhost` が必要です。

---

## 3. ディレクトリ構成

```
.
├── index.html                     # 画面・全CSS（単一ファイル）
├── app.js                         # アプリ本体（画面遷移/録音/採点/リズム/図解アニメ等）
├── config.js                      # 設定（ここだけ編集すれば挙動を切替）
├── content.js                     # アプリが読むゲームデータ（waikiki_master.xlsx から生成）
├── choicy.svg                     # マスコット Choicy
├── images/
│   ├── waikiki_map.png            # エリアマップ
│   ├── S01_V1.png …               # 各シーン/バリアントの挿絵（順次追加）
│   └── phonemes/*.svg             # 発音図解14音（generate_phoneme_svgs.py で生成）
├── audio/                         # ※非コミット。ローカル生成して配置
│   ├── S01_V1_Q.wav …             # お手本音声42本
│   └── bgm/*.mp3                  # BGM
│
├── waikiki_master.xlsx            # コンテンツのマスター（編集の起点）
├── content.js                     # ↑から生成したアプリ用データ
├── lexicon.json / audio_manifest.json
├── generate_tts.py                # お手本音声の生成スクリプト（Gemini TTS）
├── generate_phoneme_svgs.py       # 発音図解SVGの生成スクリプト
├── pin_placer.html                # マップのピン座標を決める補助ツール
│
├── diagram_theme_template.svg     # 発音図解の差し替え用テーマ（全要素・名前付き）
├── diagram_theme_parts_reference.png
└── 万次郎語スタイルガイド_v2.md     # 万次郎語の変換ルール（最新）
```

---

## 4. 設定（`config.js`）

`config.js` の `window.CONFIG` だけ編集すれば挙動を切り替えられます。

| キー | 役割 |
|---|---|
| `GEMINI_API_KEY` | 本番採点に使う Gemini のキー。空なら本番採点は不可（下の注意を必読） |
| `MODEL` | 採点に使うモデル（音声入力対応。例: `gemini-2.5-flash`、最新 flash に差し替え可） |
| `DEMO_MODE` | `true` でキー/マイク無しでもUIを試せる（採点はダミー）。実機検証時は `false` |
| `SUCCESS_THRESHOLD` / `PERFECT_THRESHOLD` | 成功/完璧の判定しきい値（Overallスコア） |
| `BLANKS_BY_STAR` | 難易度（星）ごとの穴あき数（HINT2） |
| `CHOICY_IMG` / `IMAGES_DIR` / `AUDIO_DIR` | アセットの場所 |
| `BGM` / `BGM_DEFAULT_ON` / `BGM_VOLUME` | 画面別BGMと既定ON/音量（0〜1、既定0.16） |
| `SFX_ENABLED` / `SFX` | 効果音（空文字は仮の合成音。実ファイルのパスで差し替え） |

### ⚠️ APIキーの取り扱い（重要）

- 本アプリは **クライアント側から直接 Gemini を呼ぶ** 構成のため、`config.js` にキーを書くとブラウザに露出します。
- **実キーを絶対にコミットしないでください。** 検証時のみローカルで一時的に入れ、コミット前に必ず空に戻す運用を推奨します。
- 本番運用や社外デモを想定する段階では、**サーバ/プロキシ経由で採点API を呼ぶ構成**に変更してください（キーをクライアントに置かない）。
- 推奨: `config.js` はキー空でコミットし、必要なら `config.local.js` を作って `.gitignore` する運用に分離。

`.gitignore` の例:

```
config.local.js
audio/*.wav
*.key
.DS_Store
```

---

## 5. コンテンツのデータパイプライン

コンテンツの「正」は **`waikiki_master.xlsx`**。ここを編集し、アプリ用の **`content.js`** に反映します。

- シート: `areas` / `scenes` / `variants` / `phrases` / `lexicon`
- 規模: 1エリア・7シーン・21バリアント（=会話）・42フレーズ。
- `phrases` の主な列: `phrase_id` / `scene_id` / `variant_id` / `role` / `turn_order` / `text_en` / `chunks_en`（`/`区切り）/ `manjiro_ja` / `audio_file` / `explanation_en` / `explanation_mj` など。
- `lexicon` は単語→IPA（発音ヒントに使用）。

`content.js` は `window.GAME_DATA = { areas, scenes, variants, phrases, lexicon }` の形でアプリが直接読み込みます。マスターを更新したら `content.js` 側にも同じ値を反映してください（音声生成や図解とは別管理）。

### シーン構成（難易度 = 星 ↔ CEFR）

| シーン | 場所 | 星 | 目安CEFR |
|---|---|---|---|
| S01 | ABC Store | ★1 | A1 |
| S02 | Waikiki Beach | ★1 | A1 |
| S03 | Garlic Shrimp | ★1.5 | A2 |
| S04 | Street Directions | ★1.5 | A2 |
| S05 | Diamond Head | ★2 | B1 |
| S06 | Beachside Restaurant | ★2.5 | B2 |
| S07 | Hotel Front Desk | ★3 | C1–C2 |

---

## 6. お手本音声（TTS）

- お手本音声（`audio/*.wav`、42本）は **Gemini TTS** で生成します（`generate_tts.py`、`audio_manifest.json` に声・スタイルを定義）。
- リポジトリには音声を含めず、**各自ローカル生成して `audio/` に配置**する運用を推奨（容量・権利管理のため）。
- 形式は 24kHz / mono の WAV。声はシーン・役ごとに割り当て済み（AI Studio の Voice Library で試聴・差し替え可）。

```bash
python generate_tts.py            # audio_manifest.json に従って音声を生成
# （--force で再生成など。詳細はスクリプト内のヘルプ参照）
```

---

## 7. 採点（Accuracy / Rhythm / Overall）

結果画面は3つのリングを表示します。

- **Accuracy**: 発話できた各単語の質（great / close / practice）の平均。
- **Rhythm**: 録音の実音から「内容語に山（強勢）が出ているか」「強弱の差があるか」を 0〜100 で算出。
- **Overall**: `round(0.6 × Accuracy + 0.4 × Rhythm)`。

本番採点（`DEMO_MODE: false` + キー + マイク）では、録音音声を Gemini に送って単語ごとの色分け（great/close/practice/missing）・IPA・弱点フォニームを返し、加えてクライアント側で実音のエネルギー解析から Rhythm を算出します。デモ採点はこれらを擬似生成します。

---

## 8. リズムのドット同期（Rhythmカード）

お手本と自分の音声を、強弱ドットの並びで可視化し、再生に合わせてドットをポップさせます。

- 音声のRMSエネルギー包絡からピーク（強勢）と発話区間（onset/offset）を検出。
- 各拍を発話区間にモデル比率で配置し、強拍は近傍ピークへスナップ。
- 再生位置（`currentTime`）を `requestAnimationFrame` で毎フレーム参照してポップ（setTimeout のドリフトを排除）。
- 知覚補正として約45ms 先行（`POP_LEAD`、P-center）。
- 調整ポイント: `app.js` の `analyzeAudio` 内しきい値、`assignBeatTimes` の `win`、`POP_LEAD`。

> 注: 単語単位の厳密一致には強制アライメントが必要で、現状は近似です。疑問形など語尾が伸びる文は核の後に余韻が残ります（設計どおり）。

---

## 9. 発音図解（アニメ＋読み上げ）とテーマ差し替え

- 発音のヒントに出る図解は、拡大表示で「中立の口 → その音の形」に舌が動き、ブラウザ音声合成（`speechSynthesis`）で英語のtip全文を読み上げます（「Watch & listen」）。
- 図解はJSで生成し、舌の制御点を補間してアニメーションします。サムネは `images/phonemes/*.svg`。
- **見た目の差し替え**は `diagram_theme_template.svg`（全要素・名前付き）をベースに行います。`viewBox 0 0 222 152` と各パーツの `id`（`#palate` `#tongue` `#lips-rest/round/labio` `#mark-air/nasal/voiced/voiceless` `#ipa` ほか）を保てば、見た目を自由に再デザインできます。
  - 例外: `#tongue` は形（d）をアプリがアニメで上書きするため、塗り（色/グラデ/線）のみ自由。
  - 詳細は `diagram_theme_template.svg` 冒頭のコメントと `diagram_theme_parts_reference.png` を参照。

図解SVGの再生成:

```bash
python generate_phoneme_svgs.py --out images/phonemes
```

---

## 10. 万次郎語（橋渡し表記）

英文を**英語の語順のまま**日本語の単語で簡略表記する学習用の“ピジン”表記です（英語脳訓練）。

- 最新ルールは **`万次郎語スタイルガイド_v2.md`**（v2でチャンク内も英語順に統一）。
- 例: `Where can I find / sunscreen?` → `どこ できる 私 見つける　日焼け止め？`
- 表記: チャンク間＝全角スペース、チャンク内＝半角スペース。`phrases.manjiro_ja` に格納。

---

## 11. 設定の永続化・その他

- ヘッダーの歯車から BGM / 字幕（万次郎語）をトグル。設定は `localStorage`（キー `speakup_prefs`）に保存され、リロード後も保持されます。
- 結果画面ではBGMを自動オフ。録音は iOS 対応の MIME 自動選択。

---

## 12. コンテンツの追加手順（概要）

1. `waikiki_master.xlsx` に行を追加（`phrases` など）し、`content.js` に反映。
2. 挿絵 `images/SXX_VY.png` を追加（`pin_placer.html` でマップのピン座標を取得）。
3. `audio_manifest.json` に音声定義を足し、`python generate_tts.py` で `audio/` に生成。
4. 新フォニームが必要なら `generate_phoneme_svgs.py` の `CFG` に追加して再生成。
5. `DEMO_MODE: true` のまま画面確認 → 問題なければ実機（キー+マイク）で採点確認。

---

## 13. 既知の制約 / TODO

- マップは現状ワイキキのみ。LA / NY 用マップ画像と各20挿絵（S01_V2〜S07_V3）は未投入。
- リズム同期は近似（強制アライメント未対応）。
- 採点キーがクライアント露出（§4参照）。本番はプロキシ化が必要。
- 効果音は仮の合成音（`SFX` に実ファイルを入れて差し替え）。
- 発音図解のテーマ差し替え機構は、サンプルSVG受領後にローダーを実装予定。

---

## 14. 技術メモ

- 依存ライブラリ・ビルド不要。Material Symbols / Web フォントは外部CDN参照。
- 音声解析は Web Audio（`AudioContext`）でデコード→RMS包絡→ピーク/区間検出。
- 生成スクリプト（TTS / 図解）は Python。図解は依存なし、TTSは Gemini API を使用。

---

### 連絡
不具合・改善要望は社内の担当（本リポジトリのIssue）まで。プロトタイプのため仕様は流動的です。
