import { json } from "@remix-run/node";

import type {
  PodcastCategoryTrend,
  PodcastEpisode,
  PodcastTrendSnapshot
} from "~/types/podcast";

const LISTEN_NOTES_BASE_URL = "https://listen-api.listennotes.com/api/v2";

interface ListenNotesPodcast {
  id: string;
  title: string;
  publisher: string;
  image: string;
  thumbnail: string;
  total_episodes: number;
  listen_score?: number;
  listen_score_global_rank?: string;
  listennotes_url: string;
}

interface ListenNotesEpisode {
  id: string;
  title: string;
  description: string;
  audio: string | null;
  image: string | null;
  thumbnail: string | null;
  explicit_content: boolean;
  pub_date_ms: number;
  listennotes_url: string;
}

interface ListenNotesPodcastResponse extends ListenNotesPodcast {
  episodes: ListenNotesEpisode[];
}

const CATEGORY_CONFIG = [
  {
    id: "technology",
    name: "テクノロジー",
    summary:
      "シリコンバレーから最新のAI・スタートアップ動向までをカバーする注目エピソード。",
    genreId: 127
  },
  {
    id: "news",
    name: "ニュース",
    summary:
      "アメリカ国内外で話題の政治・経済トピックを深掘りする報道番組。",
    genreId: 99
  },
  {
    id: "business",
    name: "ビジネス",
    summary:
      "企業戦略、リーダーシップ、マーケットトレンドを扱う人気番組の最新回。",
    genreId: 93
  },
  {
    id: "health_fitness",
    name: "ヘルス＆フィットネス",
    summary:
      "ウェルビーイング、メンタルヘルス、フィットネスに関する信頼のエピソード。",
    genreId: 88
  },
  {
    id: "culture",
    name: "カルチャー",
    summary:
      "ポップカルチャーから社会問題まで、多角的に米国を捉える特集回。",
    genreId: 67
  }
] as const;

const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

let cachedSnapshot: {
  expiresAt: number;
  snapshot: PodcastTrendSnapshot;
} | null = null;

async function fetchJson<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const apiKey = process.env.LISTEN_NOTES_API_KEY;
  if (!apiKey) {
    throw new Error("LISTEN_NOTES_API_KEY is not configured");
  }

  const url = `${LISTEN_NOTES_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "X-ListenAPI-Key": apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw json(
      { message: `Listen Notes API error ${response.status}` },
      { status: response.status }
    );
  }

  return (await response.json()) as T;
}

async function getTopPodcastByGenre(
  genreId: number
): Promise<ListenNotesPodcast | null> {
  try {
    const data = await fetchJson<{ podcasts: ListenNotesPodcast[] }>(
      `/best_podcasts?region=us&language=English&safe_mode=1&genre_id=${genreId}&page=1`
    );

    return data.podcasts?.[0] ?? null;
  } catch (error) {
    console.warn("Failed to fetch best podcasts", genreId, error);
    return null;
  }
}

async function getPodcastEpisodes(
  podcastId: string,
  limit: number
): Promise<ListenNotesEpisode[]> {
  try {
    const podcast = await fetchJson<ListenNotesPodcastResponse>(
      `/podcasts/${podcastId}?sort=recent_first`
    );

    return podcast.episodes?.slice(0, limit) ?? [];
  } catch (error) {
    console.warn("Failed to fetch podcast episodes", podcastId, error);
    return [];
  }
}

function mapEpisode(
  episode: ListenNotesEpisode,
  podcast: ListenNotesPodcast,
  index: number
): PodcastEpisode {
  const recencyBoost = Math.max(0, 1 - index * 0.15);
  const listenScore = Number(podcast.listen_score ?? 30) / 100;
  const freshness = 1 / Math.max(1, (Date.now() - episode.pub_date_ms) / 86400000);

  const popularityScore = Number(
    (listenScore * 70 + recencyBoost * 20 + freshness * 10).toFixed(2)
  );

  return {
    id: episode.id,
    title: episode.title,
    description: episode.description,
    audioUrl: episode.audio ?? undefined,
    podcastTitle: podcast.title,
    podcastId: podcast.id,
    imageUrl: episode.image ?? podcast.image,
    thumbnailUrl: episode.thumbnail ?? podcast.thumbnail,
    listennotesUrl: episode.listennotes_url ?? podcast.listennotes_url,
    releaseDate: new Date(episode.pub_date_ms).toISOString(),
    explicit: Boolean(episode.explicit_content),
    popularityScore
  };
}

async function buildCategoryTrend(
  genreConfig: (typeof CATEGORY_CONFIG)[number]
): Promise<PodcastCategoryTrend> {
  const topPodcast = await getTopPodcastByGenre(genreConfig.genreId);

  if (!topPodcast) {
    return fallbackCategoryTrend(genreConfig.id);
  }

  const episodes = await getPodcastEpisodes(topPodcast.id, 3);

  if (!episodes.length) {
    return fallbackCategoryTrend(genreConfig.id);
  }

  return {
    id: genreConfig.id,
    name: genreConfig.name,
    summary: genreConfig.summary,
    sampleEpisodes: episodes.map((episode, index) =>
      mapEpisode(episode, topPodcast, index)
    ),
    updatedAt: new Date().toISOString()
  };
}

const FALLBACK_SNAPSHOT: PodcastTrendSnapshot = {
  generatedAt: new Date().toISOString(),
  categories: CATEGORY_CONFIG.map((config, configIndex) => ({
    id: config.id,
    name: config.name,
    summary: config.summary,
    updatedAt: new Date().toISOString(),
    sampleEpisodes: [
      {
        id: `${config.id}-ep-1`,
        title: "サンプルエピソード 1",
        description:
          "APIキー未設定のため、ダミーデータを表示しています。リッスンノーツのAPIキーを設定すると最新トレンドが取得されます。",
        audioUrl: undefined,
        podcastTitle: `デモポッドキャスト ${configIndex + 1}`,
        podcastId: `${config.id}-podcast`,
        imageUrl: undefined,
        thumbnailUrl: undefined,
        listennotesUrl: undefined,
        releaseDate: new Date(Date.now() - configIndex * 86400000).toISOString(),
        explicit: false,
        popularityScore: 50 + configIndex * 5
      }
    ]
  }))
};

function fallbackCategoryTrend(categoryId: string): PodcastCategoryTrend {
  const fallback = FALLBACK_SNAPSHOT.categories.find(
    (category) => category.id === categoryId
  );
  if (!fallback) {
    throw new Error(`Fallback data missing for category ${categoryId}`);
  }

  return {
    ...fallback,
    updatedAt: new Date().toISOString()
  };
}

export async function getPodcastTrends(
  { forceRefresh = false }: { forceRefresh?: boolean } = {}
): Promise<PodcastTrendSnapshot> {
  const now = Date.now();

  if (!forceRefresh && cachedSnapshot && cachedSnapshot.expiresAt > now) {
    return cachedSnapshot.snapshot;
  }

  if (!process.env.LISTEN_NOTES_API_KEY) {
    cachedSnapshot = {
      expiresAt: now + CACHE_TTL_MS,
      snapshot: {
        ...FALLBACK_SNAPSHOT,
        generatedAt: new Date().toISOString()
      }
    };
    return cachedSnapshot.snapshot;
  }

  const categories = await Promise.all(
    CATEGORY_CONFIG.map((config) => buildCategoryTrend(config))
  );

  const snapshot: PodcastTrendSnapshot = {
    generatedAt: new Date().toISOString(),
    categories
  };

  cachedSnapshot = {
    expiresAt: now + CACHE_TTL_MS,
    snapshot
  };

  return snapshot;
}

export function getCategoryMetadata() {
  return CATEGORY_CONFIG.map(({ id, name, summary }) => ({
    id,
    name,
    summary
  }));
}

export async function findEpisodeById(
  episodeId: string
): Promise<{ episode: PodcastEpisode; category: PodcastCategoryTrend } | null> {
  const snapshot = await getPodcastTrends();

  for (const category of snapshot.categories) {
    const episode = category.sampleEpisodes.find((item) => item.id === episodeId);
    if (episode) {
      return { episode, category };
    }
  }

  return null;
}
