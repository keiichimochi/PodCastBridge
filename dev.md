# PodCast Bridge - 開発進捗ログ

## プロジェクト概要

PodCast Bridgeは、アメリカのポッドキャストトレンドを日本語で把握できるWebアプリケーションです。Podchaserのデータを活用して注目エピソードを抽出し、Gemini 2.5 Flash Native Audioを使用して日本語ナレーションを生成します。

## 技術スタック

- **フレームワーク**: Remix (React-based)
- **言語**: TypeScript
- **スタイル**: CSS (カスタムスタイル)
- **API統合**:
  - Podchaser API (GraphQL)
  - Google Gemini AI (Native Audio)
- **デプロイ**: 対応準備完了

## 主要機能

### 1. ポッドキャストトレンド取得・表示

**実装状況**: ✅ 完了

- **ファイル**: `app/services/trends.server.ts`
- **機能**:
  - Podchaser GraphQL APIからトレンドデータを取得
  - 5つのカテゴリー別分析（テクノロジー、ニュース、ビジネス、ヘルス&フィットネス、カルチャー）
  - 人気度スコア算出（リリース日、評価、レビュー数を総合）
  - 1時間キャッシュ機能
  - フォールバック機能（API認証エラー時）

**主要関数**:
- `getPodcastTrends()`: メイントレンド取得
- `findEpisodeById()`: 特定エピソード検索
- `buildCategoryTrend()`: カテゴリー別データ構築

### 2. 日本語ナレーション生成

**実装状況**: ✅ 完了

- **ファイル**: `app/services/tts.server.ts`
- **機能**:
  - エピソード内容の日本語翻訳
  - Gemini 2.5 Flash Native Audio（Zephyrボイス）でナレーション生成
  - 音声ファイルの保存・配信
  - 推定再生時間計算

**主要関数**:
- `synthesizeEpisodeToJapaneseAudio()`: メイン音声生成
- `generatePodcastScript()`: 台本生成
- `generateAudioFromScript()`: 音声合成

### 3. 翻訳サービス

**実装状況**: ✅ 完了

- **ファイル**: `app/services/translation.server.ts`
- **機能**:
  - Gemini AIを使用した高品質日本語翻訳
  - ポッドキャスト内容に最適化されたプロンプト

### 4. フロントエンド UI

**実装状況**: ✅ 完了

- **ファイル**: `app/routes/_index.tsx`
- **機能**:
  - レスポンシブデザイン
  - カテゴリー別エピソード表示
  - ナレーション生成ボタン
  - 音声プレーヤー統合
  - リアルタイム進捗表示

### 5. API エンドポイント

**実装状況**: ✅ 完了

- **ファイル**: `app/routes/api.tts.ts`
- **機能**:
  - POST `/api/tts`: ナレーション生成API
  - JSON/FormData両対応
  - エラーハンドリング

## 型定義

**ファイル**: `app/types/podcast.ts`

```typescript
interface PodcastEpisode {
  id: string;
  title: string;
  description: string;
  audioUrl?: string;
  podcastTitle: string;
  podcastId: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  releaseDate: string;
  explicit: boolean;
  popularityScore: number;
}

interface PodcastCategoryTrend {
  id: string;
  name: string;
  summary: string;
  sampleEpisodes: PodcastEpisode[];
  updatedAt: string;
}

interface PodcastTrendSnapshot {
  generatedAt: string;
  categories: PodcastCategoryTrend[];
}
```

## 環境変数設定

**ファイル**: `.env.sample`

```env
GEMINI_API_KEY=your_gemini_api_key_here

# Podchaser API credentials
PODCHASER_API_KEY=your_podchaser_api_key
PODCHASER_API_SECRET=your_podchaser_api_secret
```

## スタイリング

**ファイル**: `app/styles/global.css`

- **デザインシステム**: モダンなカード型レイアウト
- **カラーパレット**: 紺色をベースとした配色
- **レスポンシブ**: モバイルファーストデザイン
- **アニメーション**: スムーズなトランジション

## Podchaser API 統合詳細

### 認証フロー
1. Client Credentials方式でアクセストークン取得
2. トークンキャッシュ（安全マージン60秒）
3. GraphQL クエリ実行

### データ取得戦略
- **検索対象**: 過去48時間の最新エピソード
- **エピソード数**: カテゴリーあたり最大3件
- **スコア算出**: 新しさ + 評価 + 人気度の総合指標

### エラーハンドリング
- API認証失敗時はフォールバックデータ表示
- ネットワークエラー時の適切なログ出力
- ユーザーには常に利用可能な状態を維持

## Gemini AI 統合詳細

### ナレーション生成フロー
1. エピソード内容の日本語翻訳
2. ポッドキャスト用台本への構成
3. Native Audio APIで音声合成
4. ファイル保存とURL生成

### 音声品質
- **ボイス**: Zephyr（自然な日本語発音）
- **形式**: 高品質音声ファイル
- **長さ**: 推定再生時間を自動計算

## デプロイメント準備

### 必要な設定
1. 環境変数の設定（Gemini API Key, Podchaser認証情報）
2. 音声ファイル保存ディレクトリの確保
3. 静的ファイル配信の設定

### パフォーマンス最適化
- Podchaserデータの1時間キャッシュ
- アクセストークンの自動更新
- エラー時のフォールバック機能

## 今後の拡張可能性

1. **カテゴリー追加**: 新しいポッドキャストジャンルの対応
2. **音声カスタマイズ**: 複数ボイスオプション
3. **ユーザー機能**: お気に入り、履歴管理
4. **分析機能**: 利用統計、トレンド分析
5. **モバイルアプリ**: React Native対応

## 技術的な特徴

- **型安全性**: 完全なTypeScript対応
- **エラーハンドリング**: 堅牢なエラー処理
- **キャッシュ戦略**: 適切なデータキャッシュ
- **API設計**: RESTful APIエンドポイント
- **パフォーマンス**: 最適化されたデータ取得

---

**最終更新**: 2025年09月28日
**開発状況**: 本格運用準備完了（APIキー設定のみ必要）