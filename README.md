## PodCastBridge 使い方

### セットアップ
1. ルート直下にある `.env` に `GEMINI_API_KEY=取得したAPIキー` を追加します。
2. 依存関係をインストールします。
   ```bash
   npm install
   ```

### 開発サーバー
```bash
npm run dev
```
ブラウザで表示されるダッシュボードから、エピソードごとに「日本語ナレーションを生成」を押すと、Gemini 2.5 Flash Native Audio（Zephyrボイス）で音声が生成され、`public/audio/*.wav` として保存・再生できます。
