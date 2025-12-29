import {defineType, defineField} from 'sanity'
import {PlayIcon} from '@sanity/icons'

export default defineType({
  name: 'gameEmbed',
  title: 'Game Embed',
  type: 'object',
  icon: PlayIcon,
  fields: [
    defineField({
      name: 'embedUrl',
      type: 'url',
      title: 'Embed URL',
      description: 'URL for the embedded game (e.g., /games/week-01/index.html)',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'title',
      type: 'string',
      title: 'Title',
      description: 'Title for the game embed',
    }),
    defineField({
      name: 'aspectRatio',
      type: 'string',
      title: 'Aspect Ratio',
      description: 'Aspect ratio of the game',
      options: {
        list: [
          {title: '16:9', value: '16/9'},
          {title: '4:3', value: '4/3'},
          {title: '1:1', value: '1/1'},
        ],
        layout: 'radio',
      },
      initialValue: '16/9',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      url: 'embedUrl',
    },
    prepare({title, url}) {
      return {
        title: title || 'Game Embed',
        subtitle: url,
        media: PlayIcon,
      }
    },
  },
})
