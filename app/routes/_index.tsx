import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Form,
  Link,
  useFetcher,
  useLoaderData
} from "@remix-run/react";

import { getPodcastTrends } from "../services/trends.server";
import type {
  PodcastCategoryTrend,
  PodcastTrendSnapshot
} from "../types/podcast";
import {
  MAX_DURATION_SELECT_OPTIONS,
  maxDurationOptionToSeconds,
  normalizeMaxDuration,
  type MaxDurationOption
} from "../utils/maxDuration";

export const meta: MetaFunction = () => [
  {
    title: "US Podcast Trends | 日本語ナレーション生成"
  }
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const maxDurationSelection = normalizeMaxDuration(url.searchParams.get("maxDuration"), "5");
  const maxDurationSeconds = maxDurationOptionToSeconds(maxDurationSelection);
  const snapshot = await getPodcastTrends({ maxDurationSeconds });

  return json({ snapshot, maxDurationSelection });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const rawMaxDuration = formData.get("maxDuration");
  const maxDurationSelection = normalizeMaxDuration(
    typeof rawMaxDuration === "string" ? rawMaxDuration : null,
    "5"
  );
  const maxDurationSeconds = maxDurationOptionToSeconds(maxDurationSelection);

  if (intent === "refresh") {
    await getPodcastTrends({ forceRefresh: true, maxDurationSeconds });
  }

  return redirect(`/?maxDuration=${maxDurationSelection}`);
}

interface LoaderData {
  snapshot: PodcastTrendSnapshot;
  maxDurationSelection: MaxDurationOption;
}

interface EpisodeTtsResult {
  audioUrl: string;
  script: string;
  estimatedDurationSeconds: number;
}

export default function IndexRoute() {
  const { snapshot, maxDurationSelection } = useLoaderData<LoaderData>();
  const fetcher = useFetcher<{ success?: boolean; audioUrl?: string; script?: string; estimatedDurationSeconds?: number; episodeId?: string }>();
  const [pendingEpisodeId, setPendingEpisodeId] = useState<string | null>(null);
  const [ttsResults, setTtsResults] = useState<Record<string, EpisodeTtsResult>>({});

  useEffect(() => {
    const result = fetcher.data;
    if (fetcher.state === "idle" && result?.success && result.episodeId) {
      const episodeId = result.episodeId;
      setTtsResults((prev) => ({
        ...prev,
        [episodeId]: {
          audioUrl: result.audioUrl ?? "",
          script: result.script ?? "",
          estimatedDurationSeconds: result.estimatedDurationSeconds ?? 0
        }
      }));
      setPendingEpisodeId(null);
    }
  }, [fetcher.state, fetcher.data]);

  const isGenerating = fetcher.state !== "idle";

  const categories = snapshot.categories;

  return (
    <main className="app-shell">
      <header className="hero-card">
        <p className="hero-badge">US PODCAST INTEL</p>
        <h1 className="hero-title">アメリカのポッドキャストトレンドを日本語で素早く把握</h1>
        <p className="hero-description">
          Podchaserの番組データを解析し、分野ごとの注目エピソードを抽出します。選択したエピソードはGemini 2.5 Flash Native Audio（Zephyrボイス）で日本語ナレーション化し、即座に試聴できます。
        </p>
        <div className="hero-meta">
          <Form method="get" action="/" replace className="duration-filter">
            <label htmlFor="maxDuration" className="duration-filter__label">
              最大再生時間
            </label>
            <select id="maxDuration" name="maxDuration" defaultValue={maxDurationSelection} className="duration-filter__select">
              {MAX_DURATION_SELECT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button type="submit" className="button-ghost">
              長さを適用
            </button>
          </Form>
          <span>最終更新: {new Date(snapshot.generatedAt).toLocaleString("ja-JP")}</span>
          <Form method="post" action="?index" replace>
            <input type="hidden" name="maxDuration" value={maxDurationSelection} />
            <button className="button-ghost" name="intent" value="refresh">
              トレンドを再取得
            </button>
          </Form>
        </div>
      </header>

      <section className="category-grid">
        {categories.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            fetcher={fetcher}
            ttsResults={ttsResults}
            setPendingEpisodeId={setPendingEpisodeId}
            isGenerating={isGenerating}
            pendingEpisodeId={pendingEpisodeId}
            maxDurationSelection={maxDurationSelection}
          />
        ))}
      </section>
    </main>
  );
}

function CategoryCard({
  category,
  fetcher,
  ttsResults,
  setPendingEpisodeId,
  isGenerating,
  pendingEpisodeId,
  maxDurationSelection
}: {
  category: PodcastCategoryTrend;
  fetcher: ReturnType<typeof useFetcher>;
  ttsResults: Record<string, EpisodeTtsResult>;
  setPendingEpisodeId: (id: string | null) => void;
  isGenerating: boolean;
  pendingEpisodeId: string | null;
  maxDurationSelection: MaxDurationOption;
}) {
  return (
    <article className="category-card">
      <header className="category-card__header">
        <p className="category-card__summary">{category.summary}</p>
        <h2 className="category-card__title">{category.name}</h2>
        <p className="category-card__timestamp">
          更新: {new Date(category.updatedAt).toLocaleString("ja-JP")}
        </p>
      </header>
      <div className="episode-list">
        {category.sampleEpisodes.map((episode) => (
          <EpisodeCard
            key={episode.id}
            episode={episode}
            ttsResult={ttsResults[episode.id]}
            onGenerate={() => {
              setPendingEpisodeId(episode.id);
              fetcher.submit(
                { episodeId: episode.id, maxDuration: maxDurationSelection },
                { method: "post", action: "/api/tts" }
              );
            }}
            isGenerating={isGenerating && pendingEpisodeId === episode.id}
          />
        ))}
      </div>
    </article>
  );
}

function EpisodeCard({
  episode,
  onGenerate,
  ttsResult,
  isGenerating
}: {
  episode: PodcastCategoryTrend["sampleEpisodes"][number];
  onGenerate: () => void;
  ttsResult?: EpisodeTtsResult;
  isGenerating: boolean;
}) {
  const release = new Date(episode.releaseDate).toLocaleString("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  return (
    <div className="episode-card">
      <div className="episode-card__head">
        <div>
          <p className="episode-card__podcast">{episode.podcastTitle}</p>
          <h3 className="episode-card__title">{episode.title}</h3>
        </div>
        <span className="episode-score">スコア {episode.popularityScore}</span>
      </div>
      <p className="episode-description">{stripText(episode.description)}</p>
      <div className="episode-meta">
        <span>公開: {release}</span>
        {episode.sourceUrl ? (
          <Link to={episode.sourceUrl} target="_blank" rel="noreferrer" className="link-out">
            Podchaserで詳細を見る
          </Link>
        ) : null}
      </div>
      <button type="button" onClick={onGenerate} disabled={isGenerating} className="button-primary">
        {isGenerating ? "生成中..." : "日本語ナレーションを生成"}
      </button>
      {ttsResult ? (
        <div className="tts-panel">
          <p className="tts-panel__title">生成済みナレーション</p>
          <audio controls className="audio-player">
                <source src={ttsResult.audioUrl} type="audio/wav" />
          </audio>
          <p className="tts-panel__duration">
            推定再生時間: 約{ttsResult.estimatedDurationSeconds}秒
          </p>
          <details>
            <summary className="tts-panel__summary">原稿を表示</summary>
            <p className="tts-panel__script">{ttsResult.script}</p>
          </details>
        </div>
      ) : null}
    </div>
  );
}

function stripText(input: string) {
  return input.replace(/<[^>]*>/g, "").slice(0, 180);
}
