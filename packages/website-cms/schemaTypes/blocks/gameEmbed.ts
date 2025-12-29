import {defineType, defineField} from 'sanity'
import {PlayIcon} from '@sanity/icons'

export default defineType({
  name: 'gameEmbed',
  title: 'Game Embed',
  type: 'object',
  icon: PlayIcon,
  fields: [
    defineField({
      name: 'gameSlug',
      type: 'string',
      title: 'Game Slug',
      description: 'Name of the game project (e.g., "roguelike", "week1-game")',
      validation: (Rule) => Rule.required(),
      placeholder: 'roguelike',
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
      slug: 'gameSlug',
    },
    prepare({title, slug}) {
      return {
        title: title || 'Game Embed',
        subtitle: slug ? `/projects/${slug}/` : 'No game selected',
        media: PlayIcon,
      }
    },
  },
})
