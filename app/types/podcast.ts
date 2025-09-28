export interface PodcastEpisode {
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

export interface PodcastCategoryTrend {
  id: string;
  name: string;
  summary: string;
  sampleEpisodes: PodcastEpisode[];
  updatedAt: string;
}

export interface PodcastTrendSnapshot {
  generatedAt: string;
  categories: PodcastCategoryTrend[];
}

export interface EpisodeLengthRangeInput {
  min?: number;
  max?: number;
}

export interface DiscoverCategoryVariables {
  searchTerm: string;
  episodeCount: number;
  recentSince?: string;
  length?: EpisodeLengthRangeInput;
}
