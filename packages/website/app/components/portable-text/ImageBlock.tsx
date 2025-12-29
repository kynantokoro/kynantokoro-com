import { createClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';

type ImageBlockProps = {
  value: {
    _key: string;
    asset: {
      _ref: string;
      _type: string;
    };
    alt?: string;
    caption?: string;
  };
  projectId: string;
  dataset: string;
};

export default function ImageBlock({ value, projectId, dataset }: ImageBlockProps) {
  if (!value.asset) return null;

  const client = createClient({
    projectId,
    dataset,
    apiVersion: '2023-05-03',
    useCdn: true,
  });

  const builder = imageUrlBuilder(client);
  const imageUrl = builder.image(value).url();

  return (
    <figure className="my-8">
      <img
        src={imageUrl}
        alt={value.alt || ''}
        className="w-full rounded-lg"
        style={{ imageRendering: 'pixelated' }}
      />
      {value.caption && (
        <figcaption className="text-sm text-gray-500 dark:text-gray-400 mt-2 text-center font-serif">
          {value.caption}
        </figcaption>
      )}
    </figure>
  );
}
