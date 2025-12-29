import type { PortableTextReactComponents } from '@portabletext/react';
import GameEmbedBlock from './GameEmbedBlock';
import AudioPlayerBlock from './AudioPlayerBlock';
import ImageBlock from './ImageBlock';

export function createPortableTextComponents(
  projectId: string,
  dataset: string
): Partial<PortableTextReactComponents> {
  return {
    types: {
      gameEmbed: GameEmbedBlock,
      audioPlayer: AudioPlayerBlock,
      image: (props) => <ImageBlock {...props} projectId={projectId} dataset={dataset} />,
    },
  block: {
    h1: ({ children }) => (
      <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 font-serif mt-8 mb-4">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 font-serif mt-8 mb-4">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 font-serif mt-6 mb-3">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 font-serif mt-6 mb-3">
        {children}
      </h4>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 my-6 italic text-gray-700 dark:text-gray-300">
        {children}
      </blockquote>
    ),
    normal: ({ children }) => (
      <p className="mb-4 leading-relaxed text-gray-800 dark:text-gray-200 font-serif">
        {children}
      </p>
    ),
  },
  marks: {
    strong: ({ children }) => (
      <strong className="font-bold">{children}</strong>
    ),
    em: ({ children }) => (
      <em className="italic">{children}</em>
    ),
    code: ({ children }) => (
      <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    ),
    link: ({ children, value }) => {
      const rel = !value?.href?.startsWith('/') ? 'noreferrer noopener' : undefined;
      return (
        <a
          href={value?.href}
          rel={rel}
          target={value?.blank ? '_blank' : undefined}
          className="text-blue-600 dark:text-blue-400 underline hover:opacity-70 transition-opacity"
        >
          {children}
        </a>
      );
    },
  },
  list: {
    bullet: ({ children }) => (
      <ul className="list-disc ml-6 mb-4 space-y-2">{children}</ul>
    ),
    number: ({ children }) => (
      <ol className="list-decimal ml-6 mb-4 space-y-2">{children}</ol>
    ),
  },
  listItem: {
    bullet: ({ children }) => (
      <li className="text-gray-800 dark:text-gray-200 font-serif">{children}</li>
    ),
    number: ({ children }) => (
      <li className="text-gray-800 dark:text-gray-200 font-serif">{children}</li>
    ),
  },
  };
}
