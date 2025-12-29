type AudioPlayerBlockProps = {
  value: {
    _key: string;
    audioUrl: string;
    title?: string;
  };
};

export default function AudioPlayerBlock({ value }: AudioPlayerBlockProps) {
  if (!value.audioUrl) return null;

  return (
    <div className="my-8">
      {value.title && (
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 font-serif mb-2">
          {value.title}
        </h3>
      )}
      <audio controls className="w-full">
        <source src={value.audioUrl} type="audio/mpeg" />
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}
