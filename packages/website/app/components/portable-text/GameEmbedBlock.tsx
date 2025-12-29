import GameEmbed from '../GameEmbed';

type GameEmbedBlockProps = {
  value: {
    _key: string;
    embedUrl: string;
    title?: string;
    aspectRatio?: string;
  };
};

export default function GameEmbedBlock({ value }: GameEmbedBlockProps) {
  if (!value.embedUrl) return null;

  return (
    <div className="my-8">
      <GameEmbed
        src={value.embedUrl}
        title={value.title || 'Game'}
      />
    </div>
  );
}
