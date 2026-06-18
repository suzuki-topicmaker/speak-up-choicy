/* ============================================================
   config.js  —  ここだけ編集すれば動作を切り替えられます
   ============================================================ */
window.CONFIG = {
  /* --- Gemini 採点 --- */
  GEMINI_API_KEY: "",            // ← 本番採点を使うときにキーを入れる
  MODEL: "gemini-2.5-flash",     // 音声入力に対応するモデル。最新の 3.x flash に差し替え可
  DEMO_MODE: true,               // true = キー/マイク無しで全画面を試せる（採点はダミー）

  /* --- ゲーム設定 --- */
  SUCCESS_THRESHOLD: 80,         // これ以上で「成功（助けられた）」
  PERFECT_THRESHOLD: 90,         // これ以上で「完璧」演出
  BLANKS_BY_STAR: { "1":1, "1.5":2, "2":2, "2.5":3, "3":4 }, // HINT2 穴あき数

  /* --- アセットの場所 --- */
  CHOICY_IMG: "choicy.svg",      // アバター画像
  IMAGES_DIR: "images",          // S01_V1.png, waikiki_map.png など
  AUDIO_DIR:  "audio",           // S01_V1_Q.wav など
  BGM: {                                       // 画面別BGM
    title: "audio/bgm/bgm_title.mp3",          // タイトル・エリア選択
    scene: "audio/bgm/bgm_scene_hawaii.mp3",   // シーン・結果
  },
  BGM_DEFAULT_ON: true,
  BGM_VOLUME: 0.16,                             // BGMの音量(0〜1)。小さめ。

  /* --- 効果音（空文字 = 仮の合成音。後で実ファイルのパスを入れれば差し替え） --- */
  SFX_ENABLED: true,
  SFX: { tap:"", success:"", fail:"", perfect:"" },
};
